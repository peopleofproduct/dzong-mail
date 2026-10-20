import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { prisma } from "@dzong/database";
import type { PrismaClient } from "@dzong/database";
import type { RawAttachment, RawMessage } from "./types";

/** Root data dir for locally stored blobs. Override with DZONG_DATA_DIR
 *  (legacy UNWALLED_DATA_DIR still honoured). Pre-rename installs that
 *  stored under ~/.unwalled-mail keep reading from there unless the new
 *  dir already exists. */
export function dataDir(): string {
  const dir =
    process.env.DZONG_DATA_DIR ??
    process.env.UNWALLED_DATA_DIR ??
    path.join(homedir(), ".dzong-mail");
  const legacy = path.join(homedir(), ".unwalled-mail");
  if (
    !process.env.DZONG_DATA_DIR &&
    !process.env.UNWALLED_DATA_DIR &&
    existsSync(legacy) &&
    !existsSync(dir)
  ) {
    return legacy;
  }
  return dir;
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

const TEXTUAL_MIME = /^text\//;
const TEXTUAL_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html|log|eml|ics|yaml|yml)$/i;
const MAX_TEXT_BYTES = 512 * 1024;

/**
 * Best-effort plain-text extraction for searchable attachments. Textual
 * MIME types decode directly; PDFs are left to the lazy pdf extractor so
 * sync never blocks on a heavy parse.
 */
export function extractAttachmentText(att: RawAttachment): string | null {
  if (!att.content || att.content.length > MAX_TEXT_BYTES) return null;
  const mime = att.mimeType ?? "";
  const name = att.filename.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return extractPdfText(att.content);
  }
  if (TEXTUAL_MIME.test(mime) || TEXTUAL_EXT.test(name)) {
    const text = att.content.toString("utf8");
    // Reject binary garbage masquerading as text.
    return /[\uFFFD]/.test(text) ? null : text.slice(0, 100_000);
  }
  return null;
}

/**
 * Minimal PDF text extractor: finds text-show operators (Tj / TJ) inside
 * content streams and decodes their string operands. Lossy - ligatures and
 * font-encoded glyphs degrade - but good enough for keyword search and far
 * lighter than a PDF library dependency.
 */
function extractPdfText(buf: Buffer): string | null {
  try {
    const src = buf.toString("latin1");
    const chunks: string[] = [];
    // Literal strings preceding Tj or inside TJ arrays: (text) Tj / [(t)-2(t)] TJ
    const re = /\(((?:\\.|[^\\()])*)\)\s*(?:Tj|'|")/g;
    const arrRe = /\[((?:\(((?:\\.|[^\\()])*)\)|[^\]])*)\]\s*TJ/g;
    const unescape = (s: string) =>
      s
        .replace(
          /\\([nrtbf()\\])/g,
          (_, c: string) =>
            ({ n: "\n", r: "\r", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" })[c] ?? "",
        )
        .replace(/\\([0-7]{1,3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)));
    for (const m of src.matchAll(re)) chunks.push(unescape(m[1]));
    for (const m of src.matchAll(arrRe)) {
      for (const inner of m[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g)) {
        chunks.push(unescape(inner[1]));
      }
    }
    const text = chunks.join(" ").replace(/\s+/g, " ").trim();
    return text.length > 20 ? text.slice(0, 100_000) : null;
  } catch {
    return null;
  }
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
          contentHash: att.content ? createHash("sha256").update(att.content).digest("hex") : null,
          contentText: extractAttachmentText(att),
        },
      });
      stored++;
    }
    await db.message.update({ where: { id: messageId }, data: { hasAttachment: true } });
  }
  return stored;
}
