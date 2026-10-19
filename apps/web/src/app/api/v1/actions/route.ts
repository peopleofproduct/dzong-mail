import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiGuard, badRequest } from "../_lib";

/**
 * POST /api/v1/actions - execute an assistant-proposed mutation after the
 * user confirms it in the UI. Every execution writes an AuditEntry with the
 * same inverse payload the History page's Undo consumes, so agent actions
 * are exactly as reversible as manual ones.
 *
 *   { "kind": "archive", "messageIds": ["..."] }
 */

const MAX_IDS = 100;

type ActionKind = "archive" | "unarchive" | "mark_read" | "mark_unread" | "trash";

const KINDS: Record<
  ActionKind,
  { apply: Record<string, unknown>; inverse: string; audit: string }
> = {
  archive: { apply: { isArchived: true }, inverse: "unarchive", audit: "archive" },
  unarchive: { apply: { isArchived: false }, inverse: "archive", audit: "unarchive" },
  mark_read: { apply: { isRead: true }, inverse: "mark-unread", audit: "read" },
  mark_unread: { apply: { isRead: false }, inverse: "mark-read", audit: "unread" },
  trash: {
    apply: { isArchived: true, folder: "Trash" },
    inverse: "restore",
    audit: "move-trash",
  },
};

export async function POST(request: NextRequest) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    messageIds?: unknown;
  };
  const kind = body.kind as ActionKind;
  const spec = KINDS[kind];
  if (!spec) return badRequest(`unknown action kind: ${body.kind ?? "(missing)"}`);

  const ids = Array.isArray(body.messageIds)
    ? body.messageIds.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) return badRequest('"messageIds" must be a non-empty array');
  if (ids.length > MAX_IDS) {
    return badRequest(`refusing to touch more than ${MAX_IDS} messages at once`);
  }

  // Read marks the first-open time - same convention as markMessagesRead.
  if (kind === "mark_read") {
    await prisma.message.updateMany({
      where: { id: { in: ids }, readAt: null },
      data: { isRead: true, readAt: new Date() },
    });
    await prisma.message.updateMany({
      where: { id: { in: ids }, readAt: { not: null } },
      data: { isRead: true },
    });
  } else {
    await prisma.message.updateMany({ where: { id: { in: ids } }, data: spec.apply });
  }

  const entry = await prisma.auditEntry.create({
    data: {
      action: spec.audit,
      targetType: "message",
      targetId: ids[0],
      detail: { inverse: spec.inverse, ids, via: "assistant" },
    },
  });

  return NextResponse.json({ ok: true, applied: ids.length, auditId: entry.id });
}
