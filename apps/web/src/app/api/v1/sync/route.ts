import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { runPostSync, syncAccount, syncAllAccounts } from "@dzong/sync-engine";
import type { PostSyncStats } from "@dzong/sync-engine";
import { apiGuard } from "../_lib";

/**
 * POST /api/v1/sync — pull new mail now.
 *   {} or {"accountId": "…"}  (empty body syncs all sync-enabled accounts)
 *
 * Newly synced mail gets the same post-processing the worker applies —
 * classification, embeddings, ON_AI_CLASSIFICATION rules, notifications —
 * so a UI-triggered sync never leaves mail unprocessed until the next cycle.
 */
export async function POST(request: NextRequest) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { accountId?: string };
  try {
    const outcomes = body.accountId ? [await syncAccount(body.accountId)] : await syncAllAccounts();
    const postSync: (PostSyncStats & { accountId: string; error?: string })[] = [];
    for (const outcome of outcomes) {
      if (outcome.inserted === 0) continue;
      try {
        postSync.push({
          ...(await runPostSync(outcome.accountId, outcome.inserted)),
          accountId: outcome.accountId,
        });
      } catch (err) {
        // Post-processing failing shouldn't fail the sync itself — the
        // worker's next cycle retries classification/embedding anyway.
        postSync.push({
          accountId: outcome.accountId,
          classified: 0,
          embedded: 0,
          rulesApplied: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return NextResponse.json({ ok: true, outcomes, postSync });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
