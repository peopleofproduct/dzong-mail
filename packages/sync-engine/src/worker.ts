import { basename } from "node:path";
import { prisma } from "@unwalled/database";
import type { PrismaClient } from "@unwalled/database";
import { syncAllAccounts } from "./engine";
import { startIdleWatchers } from "./idle";
import { runPostSync } from "./post-sync";
import { dispatchScheduledDraft } from "./send";

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 30_000);
const SYNC_INTERVAL_MS = Number(process.env.WORKER_SYNC_INTERVAL_MS ?? 5 * 60_000);
const SEND_RETRY_BACKOFF_MS = 15 * 60_000;

/** Deliver scheduled drafts that have come due; failed sends retry in 15 min. */
export async function dispatchDueDrafts(db: PrismaClient = prisma): Promise<number> {
  const due = await db.message.findMany({
    where: { isDraft: true, scheduledAt: { lte: new Date() } },
    select: { id: true, subject: true },
  });
  let sent = 0;
  for (const draft of due) {
    try {
      await dispatchScheduledDraft(draft.id, db);
      sent++;
      console.log(`[worker] sent scheduled draft ${draft.id} — "${draft.subject}"`);
    } catch (err) {
      console.error(`[worker] scheduled send failed for ${draft.id}:`, err);
      await db.message.update({
        where: { id: draft.id },
        data: { scheduledAt: new Date(Date.now() + SEND_RETRY_BACKOFF_MS) },
      });
    }
  }
  return sent;
}

/** Unsnooze messages whose time has come — resurface them as unread. */
export async function returnDueSnoozes(db: PrismaClient = prisma): Promise<number> {
  const result = await db.message.updateMany({
    where: { isDraft: false, snoozedUntil: { lte: new Date() } },
    data: { snoozedUntil: null, isRead: false },
  });
  if (result.count > 0) {
    console.log(`[worker] returned ${result.count} snoozed message(s) to the inbox`);
  }
  return result.count;
}

/**
 * Sync all accounts, then classify fresh mail and fire
 * ON_AI_CLASSIFICATION rules on the newly labeled messages.
 */
export async function runSyncCycle(db: PrismaClient = prisma): Promise<void> {
  const outcomes = await syncAllAccounts(db);
  for (const outcome of outcomes) {
    if (outcome.inserted === 0) continue;
    console.log(
      `[worker] synced ${outcome.accountId}: ${outcome.inserted} new, ${outcome.updated} updated`,
    );
    await runPostSync(outcome.accountId, outcome.inserted, db);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  // The web app gets UNWALLED_SECRET_KEY from Next's .env.local loader; the
  // worker must load the same file or it can't decrypt stored credentials.
  for (const p of ["apps/web/.env.local", "../../apps/web/.env.local"]) {
    try {
      process.loadEnvFile(p);
      break;
    } catch {
      /* not found here — try the next path */
    }
  }

  console.log(
    `[worker] started — tick every ${TICK_MS / 1000}s, sync every ${SYNC_INTERVAL_MS / 60_000}m`,
  );
  try {
    await startIdleWatchers();
  } catch (err) {
    console.error("[worker] IDLE watchers failed to start:", err);
  }
  let lastSync = 0;
  while (true) {
    try {
      await dispatchDueDrafts();
      await returnDueSnoozes();
      if (Date.now() - lastSync >= SYNC_INTERVAL_MS) {
        lastSync = Date.now();
        await runSyncCycle();
      }
    } catch (err) {
      console.error("[worker] tick failed:", err);
    }
    await sleep(TICK_MS);
  }
}

const invokedFile = basename(process.argv[1] ?? "");
if (["worker.ts", "worker.js", "worker.mts", "worker.mjs"].includes(invokedFile)) {
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
  void main();
}
