import { prisma } from "@unwalled/database";
import type { EmailAccount, PrismaClient } from "@unwalled/database";
import nodemailer from "nodemailer";
import { decryptIfPresent } from "./crypto";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH_API = "https://graph.microsoft.com/v1.0";

export interface SendInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  /** Provider thread to reply within (sets In-Reply-To where applicable). */
  threadId?: string;
  inReplyToHeader?: string;
  /** When set, the message is stored as a scheduled draft — dispatch is a future worker. */
  scheduledAt?: Date;
}

export interface SendResult {
  providerMessageId: string;
  messageRowId: string;
  scheduled: boolean;
}

function encodeRawMime(mime: string): string {
  return Buffer.from(mime, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildMime(from: string, input: SendInput): string {
  const lines = [
    `From: ${from}`,
    `To: ${input.to.join(", ")}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${input.subject}`,
    `Message-ID: <${crypto.randomUUID()}@unwalled.local>`,
    ...(input.inReplyToHeader ? [`In-Reply-To: ${input.inReplyToHeader}`] : []),
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    input.bodyText,
  ];
  return lines.join("\r\n");
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
      toAddresses: input.to,
      ccAddresses: input.cc ?? [],
      bccAddresses: input.bcc ?? [],
      bodyText: input.bodyText,
      receivedAt: new Date(),
      isRead: true,
      isDraft: Boolean(input.scheduledAt),
      scheduledAt: input.scheduledAt,
      providerLabels: input.scheduledAt ? ["DRAFT"] : ["SENT"],
    },
  });
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

async function sendViaSmtp(
  db: PrismaClient,
  account: EmailAccount,
  input: SendInput,
  password: string | undefined,
): Promise<SendResult> {
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
    from: account.emailAddress,
    to: input.to.join(", "),
    cc: input.cc?.join(", "),
    bcc: input.bcc?.join(", "),
    subject: input.subject,
    text: input.bodyText,
    inReplyTo: input.inReplyToHeader,
    references: input.inReplyToHeader,
  });
  const providerMessageId = info.messageId ?? `smtp-${crypto.randomUUID()}`;
  const messageRowId = await recordSent(db, account, input, providerMessageId);
  return { providerMessageId, messageRowId, scheduled: false };
}

async function sendViaGmail(
  db: PrismaClient,
  account: EmailAccount,
  input: SendInput,
  accessToken: string,
): Promise<SendResult> {
  const raw = encodeRawMime(buildMime(account.emailAddress, input));
  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw, threadId: input.threadId }),
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string; threadId?: string };
  const messageRowId = await recordSent(
    db,
    account,
    { ...input, threadId: input.threadId ?? data.threadId },
    data.id,
  );
  return { providerMessageId: data.id, messageRowId, scheduled: false };
}

async function sendViaGraph(
  db: PrismaClient,
  account: EmailAccount,
  input: SendInput,
  accessToken: string,
): Promise<SendResult> {
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
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) throw new Error(`Graph sendMail failed: ${res.status} ${await res.text()}`);
  // sendMail returns 202 with no body; the sent copy arrives via next delta sync.
  const providerMessageId = `graph-sent-${crypto.randomUUID()}`;
  const messageRowId = await recordSent(db, account, input, providerMessageId);
  return { providerMessageId, messageRowId, scheduled: false };
}

/**
 * Send (or schedule) an email through the account's provider.
 * Scheduled messages are persisted as drafts; dispatch is a future worker.
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
