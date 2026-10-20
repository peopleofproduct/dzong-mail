import { prisma } from "@unwalled/database";
import type { Message, PrismaClient } from "@unwalled/database";
import { resolveAIForAccount, resolveAIForUser } from "./ai";
import type { ResolvedAI } from "./ai";
import { OllamaProvider, OLLAMA_DEFAULT_BASE_URL } from "@unwalled/ai-engine";
import type { AIProvider } from "@unwalled/ai-engine";
import { indexEmbedding, searchIndex, vectorIndexReady } from "./vector-index";

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
  /** "semantic" = embedding-ranked; "lexical" = keyword fallback. */
  retrieval?: "semantic" | "lexical";
  /** Why lexical was used - lets the UI handhold instead of guess. */
  retrievalReason?: string;
  reason?: string;
}

/**
 * The provider used for embeddings. The chat provider normally does both;
 * Anthropic has no embeddings API, so pair it with a local Ollama
 * embedding model (privacy stays intact - mail never leaves the machine
 * for embeddings). Returns null when nothing can embed.
 */
async function resolveEmbedder(ai: ResolvedAI): Promise<AIProvider | null> {
  if (ai.provider.type !== "ANTHROPIC") return ai.provider;
  const embedder = new OllamaProvider({
    provider: "OLLAMA",
    model: ai.settings.embeddingModel ?? undefined,
    baseUrl: OLLAMA_DEFAULT_BASE_URL,
  });
  return (await embedder.healthCheck()) ? embedder : null;
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
  const embedder = await resolveEmbedder(ai);
  if (!embedder) {
    return { accountId, embedded: 0, reason: "no embedding provider reachable" };
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
      const { embeddings, model } = await embedder.embed({ input: embeddingText(message) });
      const vector = embeddings[0];
      if (!vector?.length) continue;
      await db.message.update({
        where: { id: message.id },
        data: { embedding: vector, embeddingModel: model },
      });
      // Best-effort: also index in pgvector when the extension is available.
      await indexEmbedding(message.id, model ?? "unknown", vector, db);
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
 * Semantic search across the user's embedded messages. Uses the pgvector
 * side-index when the extension is installed; otherwise falls back to a
 * brute-force cosine scan over Message.embedding (same ranking, slower at
 * very large mailboxes).
 */
export async function semanticSearchMessages(
  userId: string,
  query: string,
  db: PrismaClient = prisma,
  options: { limit?: number; accountId?: string } = {},
): Promise<{ ok: boolean; hits: SemanticHit[]; reason?: string }> {
  const ai = await resolveAIForUser(userId, db);
  if (!ai) return { ok: false, hits: [], reason: "AI disabled or unreachable" };
  const embedder = await resolveEmbedder(ai);
  if (!embedder) return { ok: false, hits: [], reason: "no embedding provider reachable" };

  let queryVec: number[];
  let model = "unknown";
  try {
    const res = await embedder.embed({ input: query });
    queryVec = res.embeddings[0] ?? [];
    model = res.model ?? model;
  } catch (err) {
    return {
      ok: false,
      hits: [],
      reason: `embedding unavailable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (queryVec.length === 0) return { ok: false, hits: [], reason: "empty query embedding" };

  const limit = options.limit ?? 20;

  // Fast path: pgvector ANN index.
  if (await vectorIndexReady(db)) {
    const accounts = await db.emailAccount.findMany({
      where: { userId, ...(options.accountId ? { id: options.accountId } : {}) },
      select: { id: true },
    });
    const ranked = await searchIndex(
      queryVec,
      model,
      accounts.map((a) => a.id),
      limit,
      db,
    );
    const messages = await db.message.findMany({
      where: { id: { in: ranked.map((r) => r.messageId) } },
      include: { emailAccount: { select: { emailAddress: true } } },
    });
    const byId = new Map(messages.map((m) => [m.id, m]));
    const hits = ranked
      .flatMap((r) => {
        const message = byId.get(r.messageId);
        return message && r.score > 0.3 ? [{ message, score: r.score }] : [];
      });
    return { ok: true, hits };
  }

  // Fallback: brute-force cosine over the stored embeddings.
  const candidates = await db.message.findMany({
    where: {
      emailAccount: { userId, ...(options.accountId ? { id: options.accountId } : {}) },
      embedding: { isEmpty: false },
      isDraft: false,
      // Only compare like-for-like vectors; mixed dims score 0 anyway.
      // Legacy rows may predate embeddingModel - nulls are kept and lose
      // on dimension mismatch inside cosineSimilarity.
      OR: [{ embeddingModel: model }, { embeddingModel: null }],
    },
    include: { emailAccount: { select: { emailAddress: true } } },
  });

  const hits = candidates
    .map((message) => ({ message, score: cosineSimilarity(queryVec, message.embedding) }))
    .filter((h) => h.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { ok: true, hits };
}

/**
 * Keyword retrieval for when no embedding provider is reachable (e.g. an
 * Anthropic-only setup without local Ollama). Crude but honest: OR-match
 * the query terms across subject/sender/snippet, newest first.
 */
export async function lexicalSearchMessages(
  userId: string,
  query: string,
  db: PrismaClient = prisma,
  options: { limit?: number; accountId?: string } = {},
): Promise<SemanticHit[]> {
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9@.]{3,}/g) ?? [])].slice(0, 8);
  if (terms.length === 0) return [];
  const messages = await db.message.findMany({
    where: {
      emailAccount: { userId, ...(options.accountId ? { id: options.accountId } : {}) },
      isDraft: false,
      OR: terms.flatMap((t) => [
        { subject: { contains: t, mode: "insensitive" as const } },
        { fromAddress: { contains: t, mode: "insensitive" as const } },
        { fromName: { contains: t, mode: "insensitive" as const } },
        { snippet: { contains: t, mode: "insensitive" as const } },
      ]),
    },
    orderBy: { receivedAt: "desc" },
    take: options.limit ?? 20,
    include: { emailAccount: { select: { emailAddress: true } } },
  });
  return messages.map((message) => ({ message, score: 0 }));
}

/**
 * Generate a short AI digest of recent low-priority mail (newsletters,
 * marketing, promotions) — the "morning briefing" for bulk senders.
 */
export async function generateDigest(
  userId: string,
  db: PrismaClient = prisma,
  options: { days?: number; limit?: number } = {},
): Promise<AskResult> {
  const ai = await resolveAIForUser(userId, db);
  if (!ai) return { ok: false, reason: "AI disabled or unreachable" };

  const since = new Date(Date.now() - (options.days ?? 7) * 24 * 60 * 60 * 1000);
  const bulk = await db.message.findMany({
    where: {
      emailAccount: { userId },
      isDraft: false,
      isArchived: false,
      receivedAt: { gte: since },
      OR: [
        { aiLabels: { hasSome: ["NEWSLETTER", "MARKETING", "COLD_PITCH"] } },
        { providerLabels: { hasSome: ["NEWSLETTER", "CATEGORY_PROMOTIONS"] } },
      ],
    },
    orderBy: { receivedAt: "desc" },
    take: options.limit ?? 40,
    include: { emailAccount: { select: { emailAddress: true } } },
  });
  if (bulk.length === 0) {
    return { ok: false, reason: "No bulk/newsletter mail in the window — inbox is clean" };
  }

  const context = bulk
    .map(
      (m, i) =>
        `[email ${i + 1}] From: ${m.fromName ?? ""} <${m.fromAddress}> | Subject: ${m.subject ?? ""} | ${m.snippet ?? ""}`,
    )
    .join("\n");

  const completion = await ai.provider.complete({
    messages: [
      {
        role: "system",
        content:
          "Write a compact digest of these low-priority emails for the user. " +
          "Group by sender where they repeat, one bullet per topic, cite [email N]. " +
          "Flag anything that looks actionable rather than informational. " +
          "Plain text, short lines, no greeting.\n\n" +
          context,
      },
      {
        role: "user",
        content: `Digest of ${bulk.length} messages from the last ${options.days ?? 7} days.`,
      },
    ],
    temperature: 0.2,
    maxTokens: 600,
  });

  return {
    ok: true,
    answer: completion.text,
    sources: bulk.slice(0, ASK_TOP_K).map((message) => ({ message, score: 0 })),
  };
}

/**
 * "Ask my inbox" — retrieve the most relevant messages semantically, then
 * answer the question grounded in their content. Read-only; cites sources.
 */
export async function askInbox(
  userId: string,
  question: string,
  db: PrismaClient = prisma,
  options: {
    onToken?: (token: string) => void;
    /** Fired as soon as retrieval finishes, before the answer generates. */
    onSources?: (hits: SemanticHit[]) => void;
    /** Prior turns so follow-ups ("and the unread ones?") stay coherent. */
    history?: { question: string; answer: string }[];
  } = {},
): Promise<AskResult> {
  const ai = await resolveAIForUser(userId, db);
  if (!ai) return { ok: false, reason: "AI disabled or unreachable" };

  // Retrieve: semantic first, keyword fallback when nothing can embed.
  const search = await semanticSearchMessages(userId, question, db, { limit: ASK_TOP_K });
  let retrievalReason = search.reason;
  if (search.ok && search.hits.length === 0 && !retrievalReason) {
    // Zero semantic hits: either nothing is embedded yet or nothing
    // matched - the distinction changes the guidance we show.
    const embeddedCount = await db.message.count({
      where: { emailAccount: { userId }, embedding: { isEmpty: false } },
    });
    retrievalReason =
      embeddedCount === 0 ? "inbox not embedded yet" : "no messages matched semantically";
  }
  const retrieval = search.ok && search.hits.length > 0 ? "semantic" : "lexical";
  const hits =
    retrieval === "semantic"
      ? search.hits
      : await lexicalSearchMessages(userId, question, db, { limit: ASK_TOP_K });
  if (hits.length === 0) {
    return {
      ok: false,
      reason:
        retrieval === "semantic"
          ? "No relevant messages found - the inbox may not be embedded yet"
          : "No matching messages found",
    };
  }
  options.onSources?.(hits);

  const context = hits
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

  const askRequest = {
    messages: [
      {
        role: "system" as const,
        content:
          "You answer questions about the user's email inbox using only the emails provided below. " +
          "Be concise and concrete. When you use information from an email, cite it as [email N]. " +
          "If the emails don't contain the answer, say so plainly." +
          (retrieval === "lexical"
            ? " Note: these emails were matched by keyword, not meaning - they may be loosely related."
            : "") +
          "\n\n" +
          context,
      },
      ...(options.history ?? [])
        .slice(-6)
        .flatMap((turn) => [
          { role: "user" as const, content: turn.question },
          { role: "assistant" as const, content: turn.answer },
        ]),
      { role: "user" as const, content: question },
    ],
    temperature: 0.2,
    maxTokens: 800,
  };
  // Stream tokens to the caller when supported; otherwise one-shot.
  const completion =
    options.onToken && ai.provider.stream
      ? await ai.provider.stream(askRequest, options.onToken)
      : await ai.provider.complete(askRequest);

  return {
    ok: true,
    answer: completion.text,
    sources: hits,
    retrieval,
    retrievalReason: retrieval === "lexical" ? retrievalReason : undefined,
  };
}
