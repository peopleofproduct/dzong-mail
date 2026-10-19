import { prisma } from "@unwalled/database";
import type { Message, PrismaClient } from "@unwalled/database";
import { resolveAIForAccount, resolveAIForUser } from "./ai";

const EMBED_SOURCE_CHARS = 4000;
const ASK_TOP_K = 8;
const ASK_CONTEXT_CHARS = 1500;

export interface EmbedOutcome {
  accountId: string;
  embedded: number;
  reason?: string;
}

export interface SemanticHit {
  message: Message & { emailAccount: { emailAddress: string } };
  score: number;
}

export interface AskResult {
  ok: boolean;
  answer?: string;
  sources?: SemanticHit[];
  reason?: string;
}

function embeddingText(m: Message): string {
  return [
    `Subject: ${m.subject ?? ""}`,
    `From: ${m.fromName ?? ""} <${m.fromAddress}>`,
    `To: ${m.toAddresses.join(", ")}`,
    m.snippet ?? "",
    (m.bodyText ?? "").slice(0, EMBED_SOURCE_CHARS),
  ]
    .filter(Boolean)
    .join("\n");
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Embed un-embedded messages on an account via the user's configured provider.
 * Providers without embeddings (Anthropic) fail soft — callers treat this as
 * best-effort like classification.
 */
export async function embedAccountMessages(
  accountId: string,
  db: PrismaClient = prisma,
  options: { limit?: number } = {},
): Promise<EmbedOutcome> {
  const ai = await resolveAIForAccount(accountId, db);
  if (!ai) {
    return { accountId, embedded: 0, reason: "AI disabled or unreachable" };
  }

  const pending = await db.message.findMany({
    where: { emailAccountId: accountId, embedding: { isEmpty: true }, isDraft: false },
    orderBy: { receivedAt: "desc" },
    take: options.limit ?? 50,
  });
  if (pending.length === 0) return { accountId, embedded: 0 };

  let embedded = 0;
  for (const message of pending) {
    try {
      const { embeddings, model } = await ai.provider.embed({ input: embeddingText(message) });
      const vector = embeddings[0];
      if (!vector?.length) continue;
      await db.message.update({
        where: { id: message.id },
        data: { embedding: vector, embeddingModel: model },
      });
      embedded++;
    } catch (err) {
      return {
        accountId,
        embedded,
        reason: `embedding failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  return { accountId, embedded };
}

/**
 * Semantic search across the user's embedded messages — brute-force cosine.
 * Fine at local scale (thousands of messages); swap for pgvector later if a
 * power user outgrows it.
 */
export async function semanticSearchMessages(
  userId: string,
  query: string,
  db: PrismaClient = prisma,
  options: { limit?: number; accountId?: string } = {},
): Promise<{ ok: boolean; hits: SemanticHit[]; reason?: string }> {
  const ai = await resolveAIForUser(userId, db);
  if (!ai) return { ok: false, hits: [], reason: "AI disabled or unreachable" };

  let queryVec: number[];
  try {
    const { embeddings } = await ai.provider.embed({ input: query });
    queryVec = embeddings[0] ?? [];
  } catch (err) {
    return {
      ok: false,
      hits: [],
      reason: `embedding unavailable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (queryVec.length === 0) return { ok: false, hits: [], reason: "empty query embedding" };

  const candidates = await db.message.findMany({
    where: {
      emailAccount: { userId, ...(options.accountId ? { id: options.accountId } : {}) },
      embedding: { isEmpty: false },
      isDraft: false,
    },
    include: { emailAccount: { select: { emailAddress: true } } },
  });

  const hits = candidates
    .map((message) => ({ message, score: cosineSimilarity(queryVec, message.embedding) }))
    .filter((h) => h.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 20);

  return { ok: true, hits };
}

/**
 * "Ask my inbox" — retrieve the most relevant messages semantically, then
 * answer the question grounded in their content. Read-only; cites sources.
 */
export async function askInbox(
  userId: string,
  question: string,
  db: PrismaClient = prisma,
): Promise<AskResult> {
  const ai = await resolveAIForUser(userId, db);
  if (!ai) return { ok: false, reason: "AI disabled or unreachable" };

  const search = await semanticSearchMessages(userId, question, db, { limit: ASK_TOP_K });
  if (!search.ok) return { ok: false, reason: search.reason };
  if (search.hits.length === 0) {
    return {
      ok: false,
      reason: "No relevant messages found — the inbox may not be embedded yet",
    };
  }

  const context = search.hits
    .map((hit, i) =>
      [
        `[email ${i + 1}]`,
        `Subject: ${hit.message.subject ?? "(no subject)"}`,
        `From: ${hit.message.fromName ?? ""} <${hit.message.fromAddress}>`,
        `Date: ${hit.message.receivedAt.toISOString()}`,
        (hit.message.bodyText ?? hit.message.snippet ?? "").slice(0, ASK_CONTEXT_CHARS),
      ].join("\n"),
    )
    .join("\n\n---\n\n");

  const completion = await ai.provider.complete({
    messages: [
      {
        role: "system",
        content:
          "You answer questions about the user's email inbox using only the emails provided below. " +
          "Be concise and concrete. When you use information from an email, cite it as [email N]. " +
          "If the emails don't contain the answer, say so plainly.\n\n" +
          context,
      },
      { role: "user", content: question },
    ],
    temperature: 0.2,
    maxTokens: 800,
  });

  return { ok: true, answer: completion.text, sources: search.hits };
}
