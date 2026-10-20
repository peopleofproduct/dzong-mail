import { prisma } from "@dzong/database";
import type { PrismaClient } from "@dzong/database";

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

/** Attempt unsubscribe given a message's headers (no DB access). */
export async function attemptUnsubscribe(
  headers: Record<string, string>,
): Promise<UnsubscribeResult> {
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
  const result = await attemptUnsubscribe(headers);
  if (result.ok && result.method === "one-click-post") {
    await db.message.update({
      where: { id: messageId },
      data: { labels: { push: "UNSUBSCRIBED" } },
    });
  }
  return result;
}

export interface SenderUnsubscribeResult extends UnsubscribeResult {
  /** Messages archived for this sender. */
  archived: number;
}

/**
 * Bulk-unsubscribe: find the most recent message from `fromAddress` carrying
 * List-Unsubscribe headers, attempt the unsubscribe, then archive every
 * message from that sender and tag them UNSUBSCRIBED.
 */
export async function unsubscribeSender(
  fromAddress: string,
  db: PrismaClient = prisma,
): Promise<SenderUnsubscribeResult> {
  const candidates = await db.message.findMany({
    where: { fromAddress, isDraft: false },
    orderBy: { receivedAt: "desc" },
    take: 50,
  });
  const withHeader = candidates.find((m) => {
    const h = (m.headers ?? {}) as Record<string, string>;
    return h["List-Unsubscribe"] ?? h["list-unsubscribe"];
  });

  const result = withHeader
    ? await attemptUnsubscribe((withHeader.headers ?? {}) as Record<string, string>)
    : ({ ok: false, method: "none", note: "No List-Unsubscribe header" } as UnsubscribeResult);

  const { count } = await db.message.updateMany({
    where: { fromAddress, isDraft: false },
    data: { isArchived: true },
  });

  if (result.ok || result.method === "https-link" || result.method === "mailto") {
    // Tag every message from this sender so the subscription shows as handled.
    const ids = candidates.map((m) => m.id);
    for (const id of ids) {
      await db.message.update({ where: { id }, data: { labels: { push: "UNSUBSCRIBED" } } });
    }
  }

  return { ...result, archived: count };
}
