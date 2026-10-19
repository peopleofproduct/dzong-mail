import { simpleParser } from "mailparser";
import { prisma } from "@unwalled/database";
import type { PrismaClient } from "@unwalled/database";
import type { RawMessage } from "./types";

/**
 * Thunderbird / .eml / .mbox import — archives land in a dedicated
 * IMPORTED account so imported mail never syncs, never sends, and can be
 * bulk-removed by deleting one account row.
 */

const IMPORT_ADDRESS = "imported@unwalled.local";

export async function getOrCreateImportAccount(db: PrismaClient = prisma) {
  const user = await db.user.findFirstOrThrow();
  return db.emailAccount.upsert({
    where: { userId_emailAddress: { userId: user.id, emailAddress: IMPORT_ADDRESS } },
    update: {},
    create: {
      userId: user.id,
      provider: "IMPORTED",
      emailAddress: IMPORT_ADDRESS,
      displayName: "Imported mail",
      syncEnabled: false,
    },
  });
}

interface Addr {
  addresses: string[];
  name?: string;
}
const addr = (v: unknown): Addr => {
  const obj = Array.isArray(v) ? v[0] : v;
  const value = (obj as { value?: { address?: string; name?: string }[] })?.value ?? [];
  return {
    addresses: value.map((a) => a.address ?? "").filter(Boolean),
    name: value[0]?.name ?? undefined,
  };
};

async function parseOne(source: Buffer): Promise<RawMessage | null> {
  try {
    const p = await simpleParser(source);
    const from = addr(p.from);
    if (from.addresses.length === 0) return null;
    const to = addr(p.to);
    const cc = addr(p.cc);
    const bcc = addr(p.bcc);
    return {
      providerMessageId: p.messageId ?? `eml-${crypto.randomUUID()}`,
      threadId: p.references?.[0] ?? p.messageId ?? undefined,
      folder: "Imported",
      subject: p.subject ?? undefined,
      snippet: (p.text ?? "").replace(/\s+/g, " ").slice(0, 200),
      fromAddress: from.addresses[0],
      fromName: from.name,
      toAddresses: to.addresses,
      ccAddresses: cc.addresses,
      bccAddresses: bcc.addresses,
      headers: {
        "message-id": String(p.messageId ?? ""),
        "return-path": String(p.headers.get("return-path") ?? ""),
        "authentication-results": String(p.headers.get("authentication-results") ?? ""),
        "content-type": String(p.headers.get("content-type") ?? ""),
        "auto-submitted": String(p.headers.get("auto-submitted") ?? ""),
        "original-subject": String(p.headers.get("original-subject") ?? ""),
      },
      bodyText: p.text ?? undefined,
      bodyHtml: typeof p.html === "string" ? p.html : undefined,
      sizeBytes: source.length,
      receivedAt: p.date ?? new Date(),
      isRead: true, // imported archives are history, not new work
      isStarred: false,
      isDraft: false,
      providerLabels: [],
      attachments: (p.attachments ?? []).map((a) => ({
        filename: a.filename ?? (a.contentType === "text/calendar" ? "invite.ics" : "attachment"),
        mimeType: a.contentType,
        sizeBytes: a.size,
        content: a.content,
      })),
    };
  } catch {
    return null;
  }
}

/** Split an mbox file on "From " sender lines; .eml is one message. */
function splitMbox(data: Buffer): Buffer[] {
  const text = data.toString("latin1"); // preserve byte values for re-parse
  if (!/^From .*\r?\n/m.test(text)) return [data];
  const parts = text.split(/\r?\n(?=From .*(\r?\n|$))/);
  return parts
    .map((p) => (p.startsWith("From ") ? p.slice(p.indexOf("\n") + 1) : p))
    .filter((p) => p.trim().length > 50)
    .map((p) => Buffer.from(p, "latin1"));
}

export interface ImportResult {
  imported: number;
  skipped: number;
  accountId: string;
}

export async function importMailFiles(
  files: { name: string; data: Buffer }[],
  db: PrismaClient = prisma,
): Promise<ImportResult> {
  const account = await getOrCreateImportAccount(db);
  let imported = 0;
  let skipped = 0;

  for (const file of files) {
    const sources = /\.mbox$/i.test(file.name) ? splitMbox(file.data) : [file.data];
    for (const source of sources) {
      const msg = await parseOne(source);
      if (!msg) {
        skipped++;
        continue;
      }
      const created = await db.message.create({
        data: {
          emailAccountId: account.id,
          providerMessageId: msg.providerMessageId,
          threadId: msg.threadId,
          folder: msg.folder,
          subject: msg.subject,
          snippet: msg.snippet,
          fromAddress: msg.fromAddress,
          fromName: msg.fromName,
          toAddresses: msg.toAddresses,
          ccAddresses: msg.ccAddresses,
          bccAddresses: msg.bccAddresses,
          headers: msg.headers,
          bodyText: msg.bodyText,
          bodyHtml: msg.bodyHtml,
          sizeBytes: msg.sizeBytes,
          receivedAt: msg.receivedAt,
          isRead: msg.isRead,
          isDraft: msg.isDraft,
          providerLabels: msg.providerLabels,
        },
      }).catch(() => null); // unique(providerMessageId) — re-imports skip
      if (!created) {
        skipped++;
        continue;
      }
      imported++;
      const { storeAttachmentContent, extractAttachmentText } = await import("./attachments");
      const { createHash } = await import("node:crypto");
      for (const a of msg.attachments ?? []) {
        if (!a.content) continue;
        const storagePath = await storeAttachmentContent(created.id, {
          filename: a.filename,
          mimeType: a.mimeType,
          content: a.content,
        });
        await db.attachment.create({
          data: {
            messageId: created.id,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            storagePath,
            contentHash: createHash("sha256").update(a.content).digest("hex"),
            contentText: extractAttachmentText({
              filename: a.filename,
              mimeType: a.mimeType,
              content: a.content,
            }),
          },
        });
      }
    }
  }
  return { imported, skipped, accountId: account.id };
}
