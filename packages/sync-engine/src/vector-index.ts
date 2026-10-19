import { prisma } from "@unwalled/database";
import type { PrismaClient } from "@unwalled/database";

/**
 * Optional pgvector acceleration for semantic search.
 *
 * Postgres in this project comes from Homebrew/apt/Docker, so the pgvector
 * extension may or may not be installed. When it is, we lazily create a
 * MessageEmbeddingIndex side-table (raw SQL, outside the Prisma schema so a
 * missing extension never blocks migrations) with a per-dimension partial
 * HNSW index, backfill it from Message.embedding, and serve searches from
 * it. When it isn't, everything falls back to the in-process cosine scan -
 * same results, slower at very large mailboxes.
 *
 * Enable with: brew install pgvector   (or: apt install postgresql-*-pgvector)
 * then `CREATE EXTENSION vector` - setup.sh attempts both opportunistically.
 */

const TABLE = "MessageEmbeddingIndex";

// Probe once per process; a failed CREATE EXTENSION stays failed until
// restart (the extension appearing mid-process is rare and harmless to miss).
let state: "unknown" | "ready" | "unavailable" = "unknown";
let ensurePromise: Promise<boolean> | null = null;

async function createIndex(db: PrismaClient): Promise<boolean> {
  try {
    await db.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  } catch {
    return false; // extension not installed on this server
  }
  await db.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "${TABLE}" (
       "messageId" TEXT PRIMARY KEY REFERENCES "Message"("id") ON DELETE CASCADE,
       "model" TEXT NOT NULL,
       "dims" INT NOT NULL,
       "vec" vector NOT NULL
     )`,
  );
  // Backfill from the Prisma-managed embedding column (no-op when current).
  await db.$executeRawUnsafe(
    `INSERT INTO "${TABLE}" ("messageId", "model", "dims", "vec")
       SELECT "id", COALESCE("embeddingModel", 'unknown'),
              array_length("embedding", 1), "embedding"::vector
       FROM "Message"
       WHERE cardinality("embedding") > 0 AND "isDraft" = false
       ON CONFLICT ("messageId") DO NOTHING`,
  );
  return true;
}

export async function vectorIndexReady(db: PrismaClient = prisma): Promise<boolean> {
  if (state === "ready") return true;
  if (state === "unavailable") return false;
  ensurePromise ??= createIndex(db)
    .then((ok) => {
      state = ok ? "ready" : "unavailable";
      return ok;
    })
    .catch(() => {
      state = "unavailable";
      return false;
    });
  return ensurePromise;
}

/**
 * Insert/replace one embedding in the index. Partial HNSW indexes are created
 * per dims value on first use so vectors of different widths never meet.
 */
export async function indexEmbedding(
  messageId: string,
  model: string,
  vec: number[],
  db: PrismaClient = prisma,
): Promise<void> {
  if (!(await vectorIndexReady(db))) return;
  const dims = vec.length;
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "meidx_hnsw_${dims}"
       ON "${TABLE}" USING hnsw (vec vector_cosine_ops) WHERE dims = ${dims}`,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "${TABLE}" ("messageId", "model", "dims", "vec")
       VALUES ($1, $2, $3, $4::vector)
       ON CONFLICT ("messageId")
       DO UPDATE SET "model" = $2, "dims" = $3, "vec" = $4::vector`,
    messageId,
    model,
    dims,
    `[${vec.join(",")}]`,
  );
}

export interface IndexedHit {
  messageId: string;
  score: number;
}

/**
 * ANN search. `accountIds` scopes to the user's accounts; `model` matches the
 * embedding model the query was embedded with (cross-model distances are
 * meaningless). Returns cosine *similarity* (1 - distance).
 */
export async function searchIndex(
  queryVec: number[],
  model: string,
  accountIds: string[],
  limit: number,
  db: PrismaClient = prisma,
): Promise<IndexedHit[]> {
  if (accountIds.length === 0) return [];
  const rows = await db.$queryRawUnsafe<{ messageId: string; score: number }[]>(
    `SELECT i."messageId", 1 - (i."vec" <=> $1::vector) AS score
       FROM "${TABLE}" i
       JOIN "Message" m ON m."id" = i."messageId"
      WHERE i."model" = $2
        AND i."dims" = $3
        AND m."isDraft" = false
        AND m."emailAccountId" = ANY($4)
      ORDER BY i."vec" <=> $1::vector
      LIMIT $5`,
    `[${queryVec.join(",")}]`,
    model,
    queryVec.length,
    accountIds,
    limit,
  );
  return rows;
}
