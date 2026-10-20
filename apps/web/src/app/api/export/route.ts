import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { attachmentFilePath } from "@dzong/sync-engine";
import { prisma } from "@/lib/db";

/** mbox "From " separator - the sender line mbox parsers split on. */
function mboxFrom(from: string, date: Date): string {
  // ctime format: "Mon Oct 20 14:03:12 2026"
  const d = date
    .toUTCString()
    .replace(/^\w+, /, "")
    .replace(" +0000 (UTC)", " UTC");
  return `From ${from} ${d}`;
}

function encodeHeader(v: string): string {
  return /[^\x20-\x7E]/.test(v) ? `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=` : v;
}

/** Escape lines beginning "From " inside bodies (mbox convention). */
function escapeBody(text: string): string {
  return text.replace(/^(>*)From /gm, "$1>From ");
}

/** RFC-compliant Message-ID: prefer the real header captured at sync/send
 *  time, else derive a stable one from the provider id. */
function messageIdFor(m: { providerMessageId: string; headers: unknown }): string {
  const stored = (m.headers as Record<string, string> | null)?.["Message-ID"];
  if (stored) return stored.startsWith("<") ? stored : `<${stored}>`;
  const raw = m.providerMessageId.replace(/[^A-Za-z0-9.=@:_+-]/g, "_");
  return `<${raw}@dzong.local>`;
}

function wrapBase64(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\n").trimEnd();
}

/**
 * GET /api/export?account=<id> - stream the account's local mail as an
 * .mbox archive. Messages with attachments export as multipart/mixed so the
 * files survive the round trip into Thunderbird or another Dzong install.
 */
export async function GET(request: Request) {
  const accountId = new URL(request.url).searchParams.get("account");
  if (!accountId) {
    return NextResponse.json({ error: "account param required" }, { status: 400 });
  }
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { emailAccountId: accountId, isDraft: false },
    orderBy: { receivedAt: "asc" },
    include: { attachments: true },
  });

  const chunks: string[] = [];
  for (const m of messages) {
    const withFiles: { name: string; mime: string; data: Buffer }[] = [];
    for (const a of m.attachments) {
      if (!a.storagePath) continue;
      try {
        withFiles.push({
          name: a.filename.replace(/[^\w.\- ()[\]@]/g, "_"),
          mime: a.mimeType ?? "application/octet-stream",
          data: await readFile(attachmentFilePath(a.storagePath)),
        });
      } catch {
        // File missing on disk — export the message without that part.
      }
    }

    const headers: string[] = [
      `From: ${encodeHeader(m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress)}`,
      `To: ${m.toAddresses.join(", ")}`,
      ...(m.ccAddresses.length ? [`Cc: ${m.ccAddresses.join(", ")}`] : []),
      `Date: ${m.receivedAt.toUTCString()}`,
      `Subject: ${encodeHeader(m.subject ?? "")}`,
      `Message-ID: ${messageIdFor(m)}`,
      "MIME-Version: 1.0",
      `X-Dzong-Folder: ${m.folder ?? "INBOX"}`,
      `X-Dzong-Labels: ${[...m.labels, ...m.aiLabels].join(",")}`,
    ];

    const body = m.bodyHtml ?? m.bodyText ?? m.snippet ?? "";
    const bodyPart = [
      `Content-Type: ${m.bodyHtml ? "text/html" : "text/plain"}; charset=utf-8`,
      "Content-Transfer-Encoding: 8bit",
      "",
      escapeBody(body),
    ].join("\n");

    if (withFiles.length === 0) {
      chunks.push(
        `${mboxFrom(m.fromAddress, m.receivedAt)}\n${headers.join("\n")}\n` +
          `Content-Type: ${m.bodyHtml ? "text/html" : "text/plain"}; charset=utf-8\n` +
          `Content-Transfer-Encoding: 8bit\n\n${escapeBody(body)}\n\n`,
      );
      continue;
    }

    const boundary = `----dzong-${m.id.replace(/[^a-zA-Z0-9]/g, "")}`;
    const parts = withFiles
      .map(
        (f) =>
          `--${boundary}\n` +
          `Content-Type: ${f.mime}; name="${f.name}"\n` +
          `Content-Transfer-Encoding: base64\n` +
          `Content-Disposition: attachment; filename="${f.name}"\n\n` +
          wrapBase64(f.data.toString("base64")),
      )
      .join("\n");
    chunks.push(
      `${mboxFrom(m.fromAddress, m.receivedAt)}\n${headers.join("\n")}\n` +
        `Content-Type: multipart/mixed; boundary="${boundary}"\n\n` +
        `--${boundary}\n${bodyPart}\n${parts}\n--${boundary}--\n\n`,
    );
  }

  const mbox = chunks.join("");
  const safe = account.emailAddress.replace(/[^\w.@+-]/g, "_");
  return new NextResponse(mbox, {
    headers: {
      "Content-Type": "application/mbox",
      "Content-Disposition": `attachment; filename="${safe}.mbox"`,
      "Content-Length": String(Buffer.byteLength(mbox)),
    },
  });
}
