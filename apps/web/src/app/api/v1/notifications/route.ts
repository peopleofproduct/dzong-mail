import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiGuard } from "../_lib";

/** GET /api/v1/notifications — recent activity + unread count for the bell. */
export async function GET(request: NextRequest) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { readAt: null } }),
  ]);
  return NextResponse.json({ unread, items });
}
