import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** mbox "From " separator - the sender line mbox parsers split on. */
function mboxFrom(from: string, date: Date): string {
  // ctime format: "Mon Oct 20 14:03:12 2026"
  const d = date.toUTCString().replace(/^\w+, /, "").replace(" +0000 (UTC)", " UTC");
  return `From ${from} ${d}`;
}

function encodeHeader(v: string): string {
  return /[^\x20-\x7E]/.test(v) ? `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=` : v;
}

/** Escape lines beginning "From " inside bodies (mbox convention). */
function escapeBody(text: string): string {
  return text.replace(/^(>*)From /gm, "$1>From ");
}

/**
 * GET /api/export?account=<id> - stream the account's local mail as an
 * .mbox archive. Provider-independent portability: the same file imports
 * into Thunderbird or back into Unwalled on another machine.
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
  });

  const chunks: string[] = [];
  for (const m of messages) {
    const headers: string[] = [
      `From: ${encodeHeader(m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress)}`,
      `To: ${m.toAddresses.join(", ")}`,
      ...(m.ccAddresses.length ? [`Cc: ${m.ccAddresses.join(", ")}`] : []),
      `Date: ${m.receivedAt.toUTCString()}`,
      `Subject: ${encodeHeader(m.subject ?? "")}`,
      `Message-ID: <${m.providerMessageId}>`,
      `Content-Type: ${m.bodyHtml ? "text/html" : "text/plain"}; charset=utf-8`,
      "Content-Transfer-Encoding: 8bit",
      `X-Unwalled-Folder: ${m.folder ?? "INBOX"}`,
      `X-Unwalled-Labels: ${[...m.labels, ...m.aiLabels].join(",")}`,
    ];
    const body = m.bodyHtml ?? m.bodyText ?? m.snippet ?? "";
    chunks.push(`${mboxFrom(m.fromAddress, m.receivedAt)}\n${headers.join("\n")}\n\n${escapeBody(body)}\n\n`);
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
