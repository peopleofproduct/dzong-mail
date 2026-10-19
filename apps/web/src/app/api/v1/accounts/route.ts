import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiGuard } from "../_lib";

/** GET /api/v1/accounts — connected mail accounts. */
export async function GET(request: NextRequest) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const accounts = await prisma.emailAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      emailAddress: true,
      provider: true,
      isActive: true,
      syncEnabled: true,
      lastSyncedAt: true,
      _count: { select: { messages: true } },
    },
  });
  return NextResponse.json({
    accounts: accounts.map(({ _count, ...a }) => ({ ...a, messageCount: _count.messages })),
  });
}
