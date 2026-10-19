import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { prisma } from "@unwalled/database";
import type { PrismaClient } from "@unwalled/database";
import type { RawAttachment, RawMessage } from "./types";

/** Root data dir for locally stored blobs. Override with UNWALLED_DATA_DIR. */
export function dataDir(): string {
  return process.env.UNWALLED_DATA_DIR ?? path.join(homedir(), ".unwalled-mail");
}

export function attachmentsDir(): string {
  return path.join(dataDir(), "attachments");
}

/** Resolve an attachment's storagePath to an absolute filesystem path. */
export function attachmentFilePath(storagePath: string): string {
  return path.join(attachmentsDir(), storagePath);
}

/** Strip path traversal and unsafe chars from a provider-supplied filename. */
function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()[\]@]/g, "_");
  return base || "attachment";
}

/**
 * Write a fetched attachment to disk. Returns the storage path relative to
 * attachmentsDir (`<messageId>/<filename>`), or null when there is no content.
 */
export async function storeAttachmentContent(
  messageId: string,
  att: RawAttachment,
): Promise<string | null> {
  if (!att.content || att.content.length === 0) return null;
  const filename = safeFilename(att.filename);
  const dir = path.join(attachmentsDir(), messageId);
  await mkdir(dir, { recursive: true });
  const storagePath = path.join(messageId, filename);
  await writeFile(path.join(attachmentsDir(), storagePath), att.content);
  return storagePath;
}

/**
 * Persist attachments for a batch of freshly inserted messages: write any
 * fetched content to local disk and create Attachment rows. `idByProviderId`
 * maps each message's providerMessageId to its new database id.
 */
export async function persistAttachments(
  fresh: RawMessage[],
  idByProviderId: Map<string, string>,
  db: PrismaClient = prisma,
): Promise<number> {
  let stored = 0;
  for (const msg of fresh) {
    if (!msg.attachments || msg.attachments.length === 0) continue;
    const messageId = idByProviderId.get(msg.providerMessageId);
    if (!messageId) continue;

    for (const att of msg.attachments) {
      const storagePath = await storeAttachmentContent(messageId, att);
      await db.attachment.create({
        data: {
          messageId,
          filename: safeFilename(att.filename),
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes ?? att.content?.length,
          contentId: att.contentId,
          storagePath,
        },
      });
      stored++;
    }
    await db.message.update({ where: { id: messageId }, data: { hasAttachment: true } });
  }
  return stored;
}
