import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { syncAccount, syncAllAccounts } from "@unwalled/sync-engine";
import { apiGuard } from "../_lib";

/**
 * POST /api/v1/sync — pull new mail now.
 *   {} or {"accountId": "…"}  (empty body syncs all sync-enabled accounts)
 */
export async function POST(request: NextRequest) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { accountId?: string };
  try {
    const outcomes = body.accountId ? [await syncAccount(body.accountId)] : await syncAllAccounts();
    return NextResponse.json({ ok: true, outcomes });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
