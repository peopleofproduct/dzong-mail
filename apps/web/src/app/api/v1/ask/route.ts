import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { askInbox } from "@unwalled/sync-engine";
import type { SemanticHit } from "@unwalled/sync-engine";
import { getLocalUser } from "@/lib/queries";
import { apiGuard, badRequest } from "../_lib";

function serializeHit(hit: SemanticHit) {
  return {
    messageId: hit.message.id,
    threadId: hit.message.threadId,
    subject: hit.message.subject,
    fromName: hit.message.fromName,
    fromAddress: hit.message.fromAddress,
    isRead: hit.message.isRead,
    isArchived: hit.message.isArchived,
    aiLabels: hit.message.aiLabels,
    score: hit.score,
  };
}

/**
 * POST /api/v1/ask — grounded natural-language answers over local mail.
 *   { "question": "what did Alice say about the launch?" }
 *
 * With { "stream": true }, responds with newline-delimited JSON events:
 *   {"type":"token","text":"..."}*  then  {"type":"done","answer","sources"}
 *   or {"type":"error","reason":"..."}
 * which lets the UI render the answer as it is generated.
 */
export async function POST(request: NextRequest) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    stream?: boolean;
  };
  const question = body.question?.trim();
  if (!question) return badRequest('"question" is required');

  const user = await getLocalUser();
  if (!user) return NextResponse.json({ error: "No local user" }, { status: 503 });

  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        try {
          const result = await askInbox(user.id, question, undefined, {
            onToken: (text) => send({ type: "token", text }),
          });
          if (!result.ok) send({ type: "error", reason: result.reason ?? "failed" });
          else
            send({
              type: "done",
              answer: result.answer,
              sources: (result.sources ?? []).map(serializeHit),
            });
        } catch (err) {
          send({
            type: "error",
            reason: err instanceof Error ? err.message : "stream failed",
          });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const result = await askInbox(user.id, question);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 503 });
  return NextResponse.json({
    answer: result.answer,
    sources: (result.sources ?? []).map(serializeHit),
  });
}
