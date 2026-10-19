import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { attachmentFilePath } from "@unwalled/sync-engine";
import { prisma } from "@/lib/db";

interface RouteContext {
  params: Promise<{ id: string }>;
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

  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": attachment.mimeType ?? "application/octet-stream",
      "Content-Length": String(content.length),
      "Content-Disposition": `${attachment.mimeType?.startsWith("image/") ? "inline" : "attachment"}; filename="${attachment.filename.replace(/"/g, "")}"`,
    },
  });
}
