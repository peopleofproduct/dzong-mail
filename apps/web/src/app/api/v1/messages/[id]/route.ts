import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { serializeMessage } from "@/components/mail/types";
import { apiGuard, badRequest } from "../../_lib";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** GET /api/v1/messages/{id} — full message with body and attachments. */
export async function GET(request: NextRequest, context: RouteContext) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const { id } = await context.params;
  const message = await prisma.message.findUnique({
    where: { id },
    include: {
      emailAccount: { select: { emailAddress: true, provider: true } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    message: {
      ...serializeMessage(message),
      bodyText: message.bodyText,
      attachments: message.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        downloaded: Boolean(a.storagePath),
        downloadUrl: a.storagePath ? `/api/attachments/${a.id}` : null,
      })),
    },
  });
}

const ACTIONS = ["archive", "unarchive", "read", "unread", "star", "unstar"] as const;
type Action = (typeof ACTIONS)[number];

/**
 * POST /api/v1/messages/{id} — mutate a message.
 *   { "action": "archive" | "unarchive" | "read" | "unread" | "star" | "unstar" }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action as Action | undefined;
  if (!action || !ACTIONS.includes(action)) {
    return badRequest(`action must be one of: ${ACTIONS.join(", ")}`);
  }

  const data =
    action === "archive"
      ? { isArchived: true }
      : action === "unarchive"
        ? { isArchived: false }
        : action === "read"
          ? { isRead: true }
          : action === "unread"
            ? { isRead: false }
            : action === "star"
              ? { isStarred: true }
              : { isStarred: false };

  const message = await prisma.message.update({ where: { id }, data }).catch(() => null);
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id, action });
}
