import { prisma } from "@dzong/database";
import type { PrismaClient } from "@dzong/database";
import { classifyAccountMessages } from "./classify";
import { applyAutomationRules } from "./rules";
import { embedAccountMessages } from "./semantic";
import { notifyImportantMail } from "./notify";

export interface PostSyncStats {
  classified: number;
  embedded: number;
  rulesApplied: number;
  /** Why classification/embedding produced nothing (AI off, unreachable, or
   *  simply nothing pending) — surfaced so the UI can distinguish "AI down"
   *  from "nothing to index". */
  reason?: string;
}

/**
 * Everything that should happen after new mail lands — AI classification,
 * ON_AI_CLASSIFICATION rules on the freshly labeled messages, then
 * embeddings for semantic search. Shared by the periodic worker cycle and
 * the IMAP IDLE watcher so push-triggered syncs get identical treatment.
 */
export async function runPostSync(
  accountId: string,
  insertedIds: string[],
  db: PrismaClient = prisma,
): Promise<PostSyncStats> {
  const stats: PostSyncStats = { classified: 0, embedded: 0, rulesApplied: 0 };
  if (insertedIds.length === 0) return stats;

  const classification = await classifyAccountMessages(accountId, db);
  stats.classified = classification.classified;
  if (classification.labeledIds.length > 0) {
    console.log(`[post-sync] classified ${classification.classified} message(s)`);
    const results = await applyAutomationRules(accountId, db, {
      messageIds: classification.labeledIds,
      trigger: "ON_AI_CLASSIFICATION",
    });
    stats.rulesApplied = results.reduce((n, r) => n + r.applied, 0);
  }
  const embedding = await embedAccountMessages(accountId, db);
  stats.embedded = embedding.embedded;
  stats.reason = embedding.reason ?? classification.reason;
  if (embedding.embedded > 0) {
    console.log(`[post-sync] embedded ${embedding.embedded} message(s) for semantic search`);
  } else if (embedding.reason) {
    console.log(`[post-sync] embedding skipped: ${embedding.reason}`);
  }
  // Notify last — labels and rules have settled, so the importance
  // filter sees the final state of each message.
  await notifyImportantMail(accountId, insertedIds, db);
  return stats;
}
