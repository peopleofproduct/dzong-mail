import { readFile } from "node:fs/promises";
import { prisma } from "@dzong/database";
import type { EmailAccount, PrismaClient } from "@dzong/database";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { decryptIfPresent } from "./crypto";
import { attachmentFilePath, storeAttachmentContent } from "./attachments";
import { textToHtml } from "./text-html";

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
  /** Rich-text body — sent as multipart/alternative alongside bodyText. */
  bodyHtml?: string;
  attachments?: SendAttachment[];
  /** Provider thread to reply within (sets In-Reply-To where applicable). */
  threadId?: string;
  inReplyToHeader?: string;
  /** When set, the message is stored as a scheduled draft for the worker to dispatch. */
  scheduledAt?: Date;
  /** Ask the recipient's client for an MDN read receipt (honored at their discretion). */
  requestReceipt?: boolean;
  /** RFC 5322 Message-ID to stamp on the outgoing message. Generated in
   *  sendEmail when absent so every send has a stable, real identifier. */
  internetMessageId?: string;
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

/** RFC 5322 Message-ID minted under the sender's own domain. */
function generateMessageId(fromAddress: string): string {
  const domain = fromAddress.split("@")[1]?.trim() || "dzong.local";
  return `<${crypto.randomUUID()}@${domain}>`;
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
    html: input.bodyHtml,
    messageId: input.internetMessageId,
    inReplyTo: input.inReplyToHeader,
    references: input.inReplyToHeader,
    headers: input.requestReceipt
      ? {
          "Disposition-Notification-To": from,
          "Return-Receipt-To": from,
        }
      : undefined,
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
      bodyHtml: input.bodyHtml,
      // Every recorded send carries a real RFC Message-ID so exports and
      // reply threading have a stable identifier.
      headers: input.internetMessageId ? { "Message-ID": input.internetMessageId } : undefined,
      receivedAt: new Date(),
      isRead: true,
      isDraft: Boolean(input.scheduledAt),
      scheduledAt: input.scheduledAt,
      receiptRequested: input.requestReceipt ?? false,
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
  const security = account.smtpSecurity ?? "SSL_TLS";
  if (security === "NONE") {
    console.warn(
      `[send] ${account.emailAddress}: SMTP security is NONE — credentials ` +
        "travel unencrypted. Only use this for localhost bridges.",
    );
  }
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort ?? (security === "SSL_TLS" ? 465 : 587),
    secure: security === "SSL_TLS",
    // requireTLS fails the send when the server won't upgrade — no silent
    // plaintext credential downgrade. ignoreTLS makes NONE explicit.
    requireTLS: security === "STARTTLS",
    ignoreTLS: security === "NONE",
    tls: { rejectUnauthorized: !account.allowSelfSignedCerts },
    auth: { user: account.username, pass: password },
  });
  const info = await transporter.sendMail({
    from: formattedFrom(account),
    to: input.to.join(", "),
    cc: input.cc?.join(", "),
    bcc: input.bcc?.join(", "),
    subject: input.subject,
    text: input.bodyText,
    html: input.bodyHtml,
    messageId: input.internetMessageId,
    inReplyTo: input.inReplyToHeader,
    references: input.inReplyToHeader,
    headers: input.requestReceipt
      ? {
          "Disposition-Notification-To": formattedFrom(account),
          "Return-Receipt-To": formattedFrom(account),
        }
      : undefined,
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

/**
 * Graph send: create a draft then send it. sendMail returns 202 with no body,
 * which used to leave us recording a local `graph-sent-<uuid>` placeholder —
 * the next delta sync then delivered the real sent copy and Sent showed every
 * message twice. The created draft's id is stable across the Drafts → Sent
 * move, so recording it makes the sync-side dedupe work.
 */
async function deliverViaGraph(
  account: EmailAccount,
  input: SendInput,
  accessToken: string,
): Promise<{ id: string; conversationId?: string; internetMessageId?: string }> {
  const auth = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const toRecipient = (address: string) => ({ emailAddress: { address } });

  const internetMessageHeaders = [
    // In-Reply-To/References keep replies inside the original conversation
    // for recipients on Outlook and elsewhere.
    ...(input.inReplyToHeader
      ? [
          { name: "In-Reply-To", value: input.inReplyToHeader },
          { name: "References", value: input.inReplyToHeader },
        ]
      : []),
    ...(input.requestReceipt
      ? [
          { name: "Disposition-Notification-To", value: formattedFrom(account) },
          { name: "Return-Receipt-To", value: formattedFrom(account) },
        ]
      : []),
  ];

  const createRes = await fetch(`${GRAPH_API}/me/messages`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      subject: input.subject,
      body: {
        contentType: input.bodyHtml ? "HTML" : "Text",
        content: input.bodyHtml ?? input.bodyText,
      },
      toRecipients: input.to.map(toRecipient),
      ccRecipients: (input.cc ?? []).map(toRecipient),
      bccRecipients: (input.bcc ?? []).map(toRecipient),
      internetMessageHeaders: internetMessageHeaders.length ? internetMessageHeaders : undefined,
      attachments: (input.attachments ?? []).map((a) => ({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: a.filename,
        contentType: a.contentType,
        contentBytes: a.content.toString("base64"),
      })),
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Graph draft create failed: ${createRes.status} ${await createRes.text()}`);
  }
  const draft = (await createRes.json()) as { id: string };

  const sendRes = await fetch(`${GRAPH_API}/me/messages/${encodeURIComponent(draft.id)}/send`, {
    method: "POST",
    headers: { Authorization: auth.Authorization },
  });
  if (!sendRes.ok) {
    // Clean up the orphaned draft so a failed send doesn't linger in Drafts.
    await fetch(`${GRAPH_API}/me/messages/${encodeURIComponent(draft.id)}`, {
      method: "DELETE",
      headers: { Authorization: auth.Authorization },
    }).catch(() => {});
    throw new Error(`Graph send failed: ${sendRes.status} ${await sendRes.text()}`);
  }

  // Grab the real RFC Message-ID + conversationId for export fidelity and
  // thread grouping; best-effort — the send already succeeded.
  let meta: { internetMessageId?: string; conversationId?: string } = {};
  const metaRes = await fetch(
    `${GRAPH_API}/me/messages/${encodeURIComponent(draft.id)}?$select=internetMessageId,conversationId`,
    { headers: { Authorization: auth.Authorization } },
  );
  if (metaRes.ok) meta = (await metaRes.json()) as typeof meta;
  return { id: draft.id, ...meta };
}

async function sendViaGraph(
  db: PrismaClient,
  account: EmailAccount,
  input: SendInput,
  accessToken: string,
): Promise<SendResult> {
  const sent = await deliverViaGraph(account, input, accessToken);
  const messageRowId = await recordSent(
    db,
    account,
    {
      ...input,
      threadId: input.threadId ?? sent.conversationId,
      internetMessageId: sent.internetMessageId ?? input.internetMessageId,
    },
    sent.id,
  );
  return { providerMessageId: sent.id, messageRowId, scheduled: false };
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
      const sent = await deliverViaGraph(account, input, token);
      return { providerMessageId: sent.id, threadId: sent.conversationId };
    }
    case "IMPORTED":
      throw new Error("Imported accounts cannot send mail");
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
    bodyHtml: message.bodyHtml ?? (message.bodyText ? textToHtml(message.bodyText) : undefined),
    attachments: attachments.length ? attachments : undefined,
    threadId: message.threadId ?? undefined,
    requestReceipt: message.receiptRequested,
    // The draft row stored the Message-ID minted at save time — reuse it so
    // the delivered message keeps the identifier it was scheduled with.
    internetMessageId:
      (message.headers as Record<string, string> | null)?.["Message-ID"] ?? undefined,
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

  // Every send gets a stable RFC Message-ID and a rich body before it leaves —
  // text-only callers get a structured HTML alternative so recipients and the
  // Sent preview both see formatted mail.
  input.internetMessageId ??= generateMessageId(account.emailAddress);
  input.bodyHtml ??= input.bodyText ? textToHtml(input.bodyText) : undefined;

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
    case "IMPORTED":
      throw new Error("Imported accounts cannot send mail");
    default: {
      const exhaustive: never = account.provider;
      throw new Error(`No sender for provider ${String(exhaustive)}`);
    }
  }
}
