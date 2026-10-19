import { readFile } from "node:fs/promises";
import { prisma } from "@unwalled/database";
import type { EmailAccount, PrismaClient } from "@unwalled/database";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { decryptIfPresent } from "./crypto";
import { attachmentFilePath, storeAttachmentContent } from "./attachments";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH_API = "https://graph.microsoft.com/v1.0";

export interface SendAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface SendInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  attachments?: SendAttachment[];
  /** Provider thread to reply within (sets In-Reply-To where applicable). */
  threadId?: string;
  inReplyToHeader?: string;
  /** When set, the message is stored as a scheduled draft for the worker to dispatch. */
  scheduledAt?: Date;
}

export interface SendResult {
  providerMessageId: string;
  messageRowId: string;
  scheduled: boolean;
}

function encodeRawMime(mime: Buffer | string): string {
  return (typeof mime === "string" ? Buffer.from(mime, "utf8") : mime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** `"Kapil Pawar" <k@x.com>` when a display name is set, else bare address. */
function formattedFrom(account: EmailAccount): string {
  const name = account.displayName?.replace(/["<>]/g, "").trim();
  return name ? `"${name}" <${account.emailAddress}>` : account.emailAddress;
}

/** Raw RFC 822 source for the Gmail API. MailComposer handles attachment
 *  parts and header encoding correctly; the hand-rolled builder did neither. */
function buildMime(from: string, input: SendInput): Promise<Buffer> {
  const composer = new MailComposer({
    from,
    to: input.to.join(", "),
    cc: input.cc?.join(", "),
    bcc: input.bcc?.join(", "),
    subject: input.subject,
    text: input.bodyText,
    inReplyTo: input.inReplyToHeader,
    references: input.inReplyToHeader,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  return composer.compile().build() as Promise<Buffer>;
}

/** Record a sent message locally so threads and follow-up tracking stay complete. */
async function recordSent(
  db: PrismaClient,
  account: EmailAccount,
  input: SendInput,
  providerMessageId: string,
): Promise<string> {
  const row = await db.message.create({
    data: {
      emailAccountId: account.id,
      providerMessageId,
      threadId: input.threadId,
      folder: input.scheduledAt ? "Drafts" : "Sent",
      subject: input.subject,
      snippet: input.bodyText.slice(0, 200),
      fromAddress: account.emailAddress,
      fromName: account.displayName,
      toAddresses: input.to,
      ccAddresses: input.cc ?? [],
      bccAddresses: input.bcc ?? [],
      bodyText: input.bodyText,
      receivedAt: new Date(),
      isRead: true,
      isDraft: Boolean(input.scheduledAt),
      scheduledAt: input.scheduledAt,
      hasAttachment: Boolean(input.attachments?.length),
      providerLabels: input.scheduledAt ? ["DRAFT"] : ["SENT"],
    },
  });
  // Keep local copies of outgoing files so sent mail shows its attachments.
  for (const a of input.attachments ?? []) {
    const storagePath = await storeAttachmentContent(row.id, {
      filename: a.filename,
      mimeType: a.contentType,
      content: a.content,
    });
    await db.attachment.create({
      data: {
        messageId: row.id,
        filename: a.filename,
        mimeType: a.contentType,
        sizeBytes: a.content.length,
        storagePath,
      },
    });
  }
  return row.id;
}

async function sendViaMock(
  db: PrismaClient,
  account: EmailAccount,
  input: SendInput,
): Promise<SendResult> {
  const providerMessageId = `mock-sent-${crypto.randomUUID()}`;
  const messageRowId = await recordSent(db, account, input, providerMessageId);
  return { providerMessageId, messageRowId, scheduled: Boolean(input.scheduledAt) };
}

async function deliverViaSmtp(
  account: EmailAccount,
  input: SendInput,
  password: string | undefined,
): Promise<string> {
  if (!account.smtpHost || !account.username || !password) {
    throw new Error(`SMTP account ${account.id} is missing host, username, or password`);
  }
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort ?? 465,
    secure: account.smtpSecurity !== "STARTTLS" && account.smtpSecurity !== "NONE",
    auth: { user: account.username, pass: password },
  });
  const info = await transporter.sendMail({
    from: formattedFrom(account),
    to: input.to.join(", "),
    cc: input.cc?.join(", "),
    bcc: input.bcc?.join(", "),
    subject: input.subject,
    text: input.bodyText,
    inReplyTo: input.inReplyToHeader,
    references: input.inReplyToHeader,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });
  return info.messageId ?? `smtp-${crypto.randomUUID()}`;
}

async function sendViaSmtp(
  db: PrismaClient,
  account: EmailAccount,
  input: SendInput,
  password: string | undefined,
): Promise<SendResult> {
  const providerMessageId = await deliverViaSmtp(account, input, password);
  const messageRowId = await recordSent(db, account, input, providerMessageId);
  return { providerMessageId, messageRowId, scheduled: false };
}

async function deliverViaGmail(
  account: EmailAccount,
  input: SendInput,
  accessToken: string,
): Promise<{ id: string; threadId?: string }> {
  const raw = encodeRawMime(await buildMime(formattedFrom(account), input));
  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw, threadId: input.threadId }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; threadId?: string };
}

async function sendViaGmail(
  db: PrismaClient,
  account: EmailAccount,
  input: SendInput,
  accessToken: string,
): Promise<SendResult> {
  const data = await deliverViaGmail(account, input, accessToken);
  const messageRowId = await recordSent(
    db,
    account,
    { ...input, threadId: input.threadId ?? data.threadId },
    data.id,
  );
  return { providerMessageId: data.id, messageRowId, scheduled: false };
}

async function deliverViaGraph(
  account: EmailAccount,
  input: SendInput,
  accessToken: string,
): Promise<string> {
  const toRecipient = (address: string) => ({ emailAddress: { address } });
  const res = await fetch(`${GRAPH_API}/me/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "Text", content: input.bodyText },
        toRecipients: input.to.map(toRecipient),
        ccRecipients: (input.cc ?? []).map(toRecipient),
        bccRecipients: (input.bcc ?? []).map(toRecipient),
        attachments: (input.attachments ?? []).map((a) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.filename,
          contentType: a.contentType,
          contentBytes: a.content.toString("base64"),
        })),
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) throw new Error(`Graph sendMail failed: ${res.status} ${await res.text()}`);
  // sendMail returns 202 with no body; the sent copy arrives via next delta sync.
  return `graph-sent-${crypto.randomUUID()}`;
}

async function sendViaGraph(
  db: PrismaClient,
  account: EmailAccount,
  input: SendInput,
  accessToken: string,
): Promise<SendResult> {
  const providerMessageId = await deliverViaGraph(account, input, accessToken);
  const messageRowId = await recordSent(db, account, input, providerMessageId);
  return { providerMessageId, messageRowId, scheduled: false };
}

/** Deliver a SendInput through the account's provider; returns the provider message id. */
async function deliver(
  account: EmailAccount,
  input: SendInput,
): Promise<{ providerMessageId: string; threadId?: string }> {
  switch (account.provider) {
    case "MOCK":
      return { providerMessageId: `mock-sent-${crypto.randomUUID()}` };
    case "IMAP_SMTP":
      return {
        providerMessageId: await deliverViaSmtp(
          account,
          input,
          decryptIfPresent(account.passwordEncrypted),
        ),
      };
    case "GOOGLE": {
      const token = decryptIfPresent(account.oauthAccessToken);
      if (!token) throw new Error(`Account ${account.id} has no access token — reconnect`);
      const data = await deliverViaGmail(account, input, token);
      return { providerMessageId: data.id, threadId: data.threadId };
    }
    case "MICROSOFT": {
      const token = decryptIfPresent(account.oauthAccessToken);
      if (!token) throw new Error(`Account ${account.id} has no access token — reconnect`);
      return { providerMessageId: await deliverViaGraph(account, input, token) };
    }
    default: {
      const exhaustive: never = account.provider;
      throw new Error(`No sender for provider ${String(exhaustive)}`);
    }
  }
}

/**
 * Dispatch a draft: deliver it through the account's real provider and flip
 * the existing row from Drafts to Sent. Used by the worker for scheduled
 * sends and by the UI for manual "send now" on drafts.
 */
export async function dispatchScheduledDraft(
  messageId: string,
  db: PrismaClient = prisma,
): Promise<void> {
  const message = await db.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { emailAccount: true, attachments: true },
  });
  if (!message.isDraft) return;

  // Reattach files stored when the draft was saved.
  const attachments: SendAttachment[] = [];
  for (const a of message.attachments) {
    if (!a.storagePath) continue;
    try {
      attachments.push({
        filename: a.filename,
        contentType: a.mimeType ?? "application/octet-stream",
        content: await readFile(attachmentFilePath(a.storagePath)),
      });
    } catch {
      // File went missing from disk - send without it rather than fail.
    }
  }

  const input: SendInput = {
    to: message.toAddresses,
    cc: message.ccAddresses,
    bcc: message.bccAddresses,
    subject: message.subject ?? "",
    bodyText: message.bodyText ?? message.snippet ?? "",
    attachments: attachments.length ? attachments : undefined,
    threadId: message.threadId ?? undefined,
  };

  const { providerMessageId, threadId } = await deliver(message.emailAccount, input);
  await db.message.update({
    where: { id: message.id },
    data: {
      folder: "Sent",
      isDraft: false,
      scheduledAt: null,
      providerMessageId,
      providerLabels: ["SENT"],
      receivedAt: new Date(),
      ...(threadId && !message.threadId ? { threadId } : {}),
    },
  });
}

/**
 * Send (or schedule) an email through the account's provider.
 * Scheduled messages are persisted as drafts; the worker dispatches them
 * via dispatchScheduledDraft when they come due.
 */
export async function sendEmail(
  accountId: string,
  input: SendInput,
  db: PrismaClient = prisma,
): Promise<SendResult> {
  const account = await db.emailAccount.findUniqueOrThrow({ where: { id: accountId } });

  if (input.scheduledAt || account.provider === "MOCK") {
    return sendViaMock(db, account, input);
  }

  switch (account.provider) {
    case "IMAP_SMTP":
      return sendViaSmtp(db, account, input, decryptIfPresent(account.passwordEncrypted));
    case "GOOGLE": {
      const token = decryptIfPresent(account.oauthAccessToken);
      if (!token) throw new Error(`Account ${accountId} has no access token — reconnect`);
      return sendViaGmail(db, account, input, token);
    }
    case "MICROSOFT": {
      const token = decryptIfPresent(account.oauthAccessToken);
      if (!token) throw new Error(`Account ${accountId} has no access token — reconnect`);
      return sendViaGraph(db, account, input, token);
    }
    default: {
      const exhaustive: never = account.provider;
      throw new Error(`No sender for provider ${String(exhaustive)}`);
    }
  }
}
