import { prisma } from "@unwalled/database";
import type { PrismaClient } from "@unwalled/database";
import { classifyAccountMessages } from "./classify";
import { applyAutomationRules } from "./rules";
import { embedAccountMessages } from "./semantic";

/**
 * Everything that should happen after new mail lands — AI classification,
 * ON_AI_CLASSIFICATION rules on the freshly labeled messages, then
 * embeddings for semantic search. Shared by the periodic worker cycle and
 * the IMAP IDLE watcher so push-triggered syncs get identical treatment.
 */
export async function runPostSync(
  accountId: string,
  inserted: number,
  db: PrismaClient = prisma,
): Promise<void> {
  if (inserted === 0) return;
  const classification = await classifyAccountMessages(accountId, db);
  if (classification.labeledIds.length > 0) {
    console.log(`[post-sync] classified ${classification.classified} message(s)`);
    await applyAutomationRules(accountId, db, {
      messageIds: classification.labeledIds,
      trigger: "ON_AI_CLASSIFICATION",
    });
  }
  const embedding = await embedAccountMessages(accountId, db);
  if (embedding.embedded > 0) {
    console.log(`[post-sync] embedded ${embedding.embedded} message(s) for semantic search`);
  } else if (embedding.reason) {
    console.log(`[post-sync] embedding skipped: ${embedding.reason}`);
  }
}
