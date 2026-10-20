import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { askInbox, proposeActions } from "@unwalled/sync-engine";
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

/** Action proposals ride the `done` event - confirm-gated mutations over
 *  exactly the messages the answer cited. */
function serializeActions(question: string, sources: SemanticHit[] | undefined) {
  return proposeActions(question, sources ?? []);
}

/**
 * POST /api/v1/ask — grounded natural-language answers over local mail.
 *   { "question": "what did Alice say about the launch?" }
 *
 * With { "stream": true }, responds with newline-delimited JSON events:
 *   {"type":"status","stage":"retrieving"}
 *   {"type":"sources","sources":[...]}      (as soon as retrieval finishes)
 *   {"type":"token","text":"..."}*         (the answer, as generated)
 *   {"type":"done","answer","retrieval"}   or {"type":"error","reason"}
 */
export async function POST(request: NextRequest) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    stream?: boolean;
    history?: unknown;
  };
  const question = body.question?.trim();
  if (!question) return badRequest('"question" is required');

  // Prior turns for follow-up coherence - bounded, strings only.
  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (t): t is { question: string; answer: string } =>
            typeof t?.question === "string" && typeof t?.answer === "string",
        )
        .slice(-6)
        .map((t) => ({
          question: t.question.slice(0, 500),
          answer: t.answer.slice(0, 2000),
        }))
    : [];

  const user = await getLocalUser();
  if (!user) return NextResponse.json({ error: "No local user" }, { status: 503 });

  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        try {
          send({ type: "status", stage: "retrieving" });
          const result = await askInbox(user.id, question, undefined, {
            history,
            onSources: (hits) => send({ type: "sources", sources: hits.map(serializeHit) }),
            onToken: (text) => send({ type: "token", text }),
          });
          if (!result.ok) send({ type: "error", reason: result.reason ?? "failed" });
          else
            send({
              type: "done",
              answer: result.answer,
              retrieval: result.retrieval ?? "semantic",
              retrievalReason: result.retrievalReason,
              sources: (result.sources ?? []).map(serializeHit),
              actions: serializeActions(question, result.sources),
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

  const result = await askInbox(user.id, question, undefined, { history });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 503 });
  return NextResponse.json({
    answer: result.answer,
    sources: (result.sources ?? []).map(serializeHit),
    actions: serializeActions(question, result.sources),
  });
}
