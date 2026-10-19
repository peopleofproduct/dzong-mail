import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { askInbox } from "@unwalled/sync-engine";
import { getLocalUser } from "@/lib/queries";
import { apiGuard, badRequest } from "../_lib";

/**
 * POST /api/v1/ask — grounded natural-language answers over local mail.
 *   { "question": "what did Alice say about the launch?" }
 */
export async function POST(request: NextRequest) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { question?: string };
  const question = body.question?.trim();
  if (!question) return badRequest('"question" is required');

  const user = await getLocalUser();
  if (!user) return NextResponse.json({ error: "No local user" }, { status: 503 });

  const result = await askInbox(user.id, question);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 503 });
  return NextResponse.json({
    answer: result.answer,
    sources: (result.sources ?? []).map((hit) => ({
      messageId: hit.message.id,
      threadId: hit.message.threadId,
      subject: hit.message.subject,
      fromAddress: hit.message.fromAddress,
      score: hit.score,
    })),
  });
}
