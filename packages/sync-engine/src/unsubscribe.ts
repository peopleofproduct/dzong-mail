import { prisma } from "@unwalled/database";
import type { PrismaClient } from "@unwalled/database";

export interface UnsubscribeResult {
  ok: boolean;
  method: "one-click-post" | "https-link" | "mailto" | "none";
  target?: string;
  note?: string;
}

function parseListUnsubscribe(header: string): { https?: string; mailto?: string } {
  const urls = header.match(/<([^>]+)>/g)?.map((s) => s.slice(1, -1)) ?? [];
  return {
    https: urls.find((u) => u.startsWith("http")),
    mailto: urls.find((u) => u.startsWith("mailto:")),
  };
}

/**
 * Attempt to unsubscribe from a mailing list using the message's
 * List-Unsubscribe headers (RFC 2369 / RFC 8058 one-click).
 */
export async function unsubscribeMessage(
  messageId: string,
  db: PrismaClient = prisma,
): Promise<UnsubscribeResult> {
  const message = await db.message.findUniqueOrThrow({ where: { id: messageId } });
  const headers = (message.headers ?? {}) as Record<string, string>;
  const listHeader = headers["List-Unsubscribe"] ?? headers["list-unsubscribe"] ?? undefined;
  const post = headers["List-Unsubscribe-Post"] ?? headers["list-unsubscribe-post"];

  if (!listHeader) {
    return { ok: false, method: "none", note: "No List-Unsubscribe header" };
  }

  const { https, mailto } = parseListUnsubscribe(listHeader);

  // RFC 8058 one-click: POST with a fixed body.
  if (https && post?.toLowerCase().includes("list-unsubscribe=one-click")) {
    try {
      const res = await fetch(https, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });
      if (res.ok) {
        await db.message.update({
          where: { id: messageId },
          data: { labels: { push: "UNSUBSCRIBED" } },
        });
        return { ok: true, method: "one-click-post", target: https };
      }
      return { ok: false, method: "one-click-post", target: https, note: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, method: "one-click-post", target: https, note: String(err) };
    }
  }

  if (https) {
    return {
      ok: true,
      method: "https-link",
      target: https,
      note: "Open link in browser to confirm",
    };
  }
  if (mailto) {
    return {
      ok: true,
      method: "mailto",
      target: mailto,
      note: "Send unsubscribe email to confirm",
    };
  }
  return { ok: false, method: "none", note: "Unparseable List-Unsubscribe header" };
}
