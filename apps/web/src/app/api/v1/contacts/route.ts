import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiGuard, badRequest } from "../_lib";

/**
 * GET /api/v1/contacts?email=a@b.com - a pocket dossier for the browser
 * extension's mailto: hover card. Counts only; no bodies leave the API.
 */
export async function GET(request: NextRequest) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email || !email.includes("@")) return badRequest('"email" is required');

  const where = { fromAddress: { equals: email, mode: "insensitive" as const }, isDraft: false };
  const [last, unread, needsReply, exchanged] = await Promise.all([
    prisma.message.findFirst({
      where,
      orderBy: { receivedAt: "desc" },
      select: { subject: true, receivedAt: true },
    }),
    prisma.message.count({ where: { ...where, isRead: false, isArchived: false } }),
    prisma.message.count({
      where: { ...where, aiLabels: { has: "NEEDS_REPLY" }, isRead: false },
    }),
    prisma.message.count({ where }),
  ]);

  if (exchanged === 0) return NextResponse.json({ known: false });
  return NextResponse.json({
    known: true,
    exchanged,
    unread,
    needsReply,
    lastSubject: last?.subject ?? null,
    lastAt: last?.receivedAt ?? null,
  });
}
