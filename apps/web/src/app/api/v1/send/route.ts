import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sendEmail } from "@dzong/sync-engine";
import { prisma } from "@/lib/db";
import { apiGuard, badRequest } from "../_lib";

interface SendBody {
  accountId?: string;
  to?: string | string[];
  cc?: string | string[];
  subject?: string;
  body?: string;
  scheduledAt?: string; // ISO timestamp — stores a scheduled draft
}

/**
 * POST /api/v1/send — send mail through a connected account.
 *   { "to": "a@b.com" | ["a@b.com"], "subject": "...", "body": "...",
 *     "accountId": "…" (defaults to first account), "scheduledAt": ISO }
 */
export async function POST(request: NextRequest) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const input = (await request.json().catch(() => ({}))) as SendBody;
  const to = (Array.isArray(input.to) ? input.to : (input.to?.split(",") ?? []))
    .map((s) => s.trim())
    .filter(Boolean);
  if (to.length === 0) return badRequest('"to" is required');

  const accountId =
    input.accountId ??
    (await prisma.emailAccount.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))
      ?.id;
  if (!accountId) return badRequest("No mail account configured");

  try {
    const result = await sendEmail(accountId, {
      to,
      cc: (Array.isArray(input.cc) ? input.cc : (input.cc?.split(",") ?? []))
        .map((s) => s.trim())
        .filter(Boolean),
      subject: input.subject ?? "",
      bodyText: input.body ?? "",
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
