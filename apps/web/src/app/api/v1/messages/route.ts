import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getMessagesForFolder,
  getMessagesForLabel,
  getMessagesForView,
  parseView,
  searchMessagesSemantic,
} from "@/lib/queries";
import { serializeMessage } from "@/components/mail/types";
import { apiGuard, badRequest } from "../_lib";

/**
 * GET /api/v1/messages — list mail.
 *   view     inbox|starred|snoozed|drafts|sent|archive|newsletters|digest  (default inbox)
 *   q        keyword search (subject/from/snippet/body)
 *   semantic set to 1 for embedding-based search (requires q)
 *   label    filter by label/aiLabel
 *   folder   filter by provider folder
 *   limit    max results (default 50, max 200)
 */
export async function GET(request: NextRequest) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const p = request.nextUrl.searchParams;
  const q = p.get("q")?.trim() || undefined;
  const label = p.get("label") ?? undefined;
  const folder = p.get("folder") ?? undefined;
  const limit = Math.min(Number(p.get("limit") ?? "50") || 50, 200);

  if (p.get("semantic") === "1") {
    if (!q) return badRequest("semantic search requires ?q=");
    const result = await searchMessagesSemantic(q, limit);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 503 });
    return NextResponse.json({ messages: result.hits });
  }

  const rows = label
    ? await getMessagesForLabel(label, limit)
    : folder
      ? await getMessagesForFolder(folder, limit)
      : await getMessagesForView(parseView(p.get("view") ?? undefined), q, limit);

  return NextResponse.json({ messages: rows.map(serializeMessage) });
}
