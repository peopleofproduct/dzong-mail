import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { attachmentFilePath } from "@dzong/sync-engine";
import { prisma } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Only inert raster images may render inline from this origin. SVG, HTML,
 * XML and anything else goes out as a download — an inline
 * image/svg+xml from a sender would execute script in the app's origin.
 */
const INLINE_SAFE = /^image\/(png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)$/i;

/** Strip header-breaking and filesystem-hostile characters from filenames. */
function safeHeaderName(name: string): string {
  return name.replace(/[^\w.\- ()[\]@]/g, "_") || "attachment";
}

/** Download a locally stored attachment file. */
export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment || !attachment.storagePath) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  let content: Buffer;
  try {
    content = await readFile(attachmentFilePath(attachment.storagePath));
  } catch {
    return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  }

  const mime = attachment.mimeType ?? "application/octet-stream";
  const inline = INLINE_SAFE.test(mime);
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": inline ? mime : "application/octet-stream",
      "Content-Length": String(content.length),
      // nosniff stops the browser reinterpreting the declared type anyway.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeHeaderName(attachment.filename)}"`,
    },
  });
}
