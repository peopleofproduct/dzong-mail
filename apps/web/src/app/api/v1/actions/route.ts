import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { unsubscribeSender, draftAiReply } from "@unwalled/sync-engine";
import { apiGuard, badRequest } from "../_lib";

/**
 * POST /api/v1/actions - execute an assistant-proposed mutation after the
 * user confirms it in the UI. Every execution writes an AuditEntry with the
 * same inverse payload the History page's Undo consumes, so agent actions
 * are exactly as reversible as manual ones.
 *
 *   { "kind": "archive", "messageIds": ["..."], "params": { ... } }
 */

const MAX_IDS = 100;
const MAX_DRAFTS = 8;

type ActionKind =
  | "archive"
  | "unarchive"
  | "mark_read"
  | "mark_unread"
  | "trash"
  | "label"
  | "unlabel"
  | "snooze"
  | "star"
  | "unstar"
  | "unsubscribe"
  | "draft_reply";

const SIMPLE: Record<string, { apply: Record<string, unknown>; inverse: string; audit: string }> =
  {
    archive: { apply: { isArchived: true }, inverse: "unarchive", audit: "archive" },
    unarchive: { apply: { isArchived: false }, inverse: "archive", audit: "unarchive" },
    mark_unread: { apply: { isRead: false }, inverse: "mark-read", audit: "unread" },
    trash: {
      apply: { isArchived: true, folder: "Trash" },
      inverse: "restore",
      audit: "move-trash",
    },
    star: { apply: { isStarred: true }, inverse: "toggle-flag", audit: "star" },
    unstar: { apply: { isStarred: false }, inverse: "toggle-flag", audit: "unstar" },
  };

async function writeAudit(
  action: string,
  ids: string[],
  detail: Record<string, unknown>,
) {
  return prisma.auditEntry.create({
    data: {
      action,
      targetType: "message",
      targetId: ids[0] ?? "assistant",
      detail: { ...detail, ids, via: "assistant" },
    },
  });
}

export async function POST(request: NextRequest) {
  const denied = apiGuard(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    messageIds?: unknown;
    params?: { label?: string; hours?: number; senders?: unknown };
  };
  const kind = body.kind as ActionKind;

  const ids = Array.isArray(body.messageIds)
    ? body.messageIds.filter((x): x is string => typeof x === "string")
    : [];

  // ── unsubscribe: operates on senders, archives their whole local corpus ──
  if (kind === "unsubscribe") {
    const senders = Array.isArray(body.params?.senders)
      ? body.params.senders.filter((x): x is string => typeof x === "string").slice(0, 10)
      : [];
    if (senders.length === 0) return badRequest("unsubscribe needs params.senders");

    // Capture what will be archived so undo restores exactly this set.
    const toArchive = await prisma.message.findMany({
      where: { fromAddress: { in: senders }, isDraft: false, isArchived: false },
      select: { id: true },
    });
    const results = [];
    for (const addr of senders) {
      results.push({ sender: addr, ...(await unsubscribeSender(addr)) });
    }
    const archivedIds = toArchive.map((m) => m.id);
    const entry = await writeAudit("unsubscribe", archivedIds, {
      inverse: "unarchive",
      senders,
    });
    return NextResponse.json({ ok: true, results, archived: archivedIds.length, auditId: entry.id });
  }

  // ── draft_reply: AI-draft for each cited thread (small cap, it costs model time) ──
  if (kind === "draft_reply") {
    if (ids.length === 0) return badRequest('"messageIds" must be a non-empty array');
    const capped = ids.slice(0, MAX_DRAFTS);
    const draftIds: string[] = [];
    let failed = 0;
    for (const id of capped) {
      const res = await draftAiReply(id).catch(() => ({ ok: false as const }));
      if (res.ok && "draftId" in res && res.draftId) draftIds.push(res.draftId);
      else failed += 1;
    }
    if (draftIds.length === 0) {
      return NextResponse.json({ ok: false, error: "No drafts could be generated" }, { status: 502 });
    }
    const entry = await prisma.auditEntry.create({
      data: {
        action: "draft-reply",
        targetType: "message",
        targetId: draftIds[0],
        detail: { inverse: "delete-drafts", ids: draftIds, via: "assistant" },
      },
    });
    return NextResponse.json({ ok: true, drafted: draftIds.length, failed, auditId: entry.id });
  }

  if (ids.length === 0) return badRequest('"messageIds" must be a non-empty array');
  if (ids.length > MAX_IDS) {
    return badRequest(`refusing to touch more than ${MAX_IDS} messages at once`);
  }

  // ── label / unlabel: need per-message read-modify-write on the array ──
  if (kind === "label" || kind === "unlabel") {
    const name = typeof body.params?.label === "string" ? body.params.label.trim() : "";
    if (!name) return badRequest("label actions need params.label");
    const rows = await prisma.message.findMany({
      where: { id: { in: ids } },
      select: { id: true, labels: true },
    });
    for (const row of rows) {
      const next =
        kind === "label"
          ? row.labels.includes(name)
            ? row.labels
            : [...row.labels, name]
          : row.labels.filter((l) => l !== name);
      if (next.length !== row.labels.length || kind === "label") {
        await prisma.message.update({ where: { id: row.id }, data: { labels: next } });
      }
    }
    const entry = await writeAudit(kind, ids, {
      inverse: kind === "label" ? "unlabel" : "label",
      label: name,
    });
    return NextResponse.json({ ok: true, applied: ids.length, auditId: entry.id });
  }

  // ── snooze: duration comes from the proposal's parsed params ──
  if (kind === "snooze") {
    const hours = Math.min(Math.max(Number(body.params?.hours) || 24, 1), 24 * 30);
    await prisma.message.updateMany({
      where: { id: { in: ids } },
      data: { snoozedUntil: new Date(Date.now() + hours * 60 * 60 * 1000) },
    });
    const entry = await writeAudit("snooze", ids, { inverse: "unsnooze", hours });
    return NextResponse.json({ ok: true, applied: ids.length, hours, auditId: entry.id });
  }

  // ── mark_read: stamps first-open time like markMessagesRead ──
  if (kind === "mark_read") {
    await prisma.message.updateMany({
      where: { id: { in: ids }, readAt: null },
      data: { isRead: true, readAt: new Date() },
    });
    await prisma.message.updateMany({
      where: { id: { in: ids }, readAt: { not: null } },
      data: { isRead: true },
    });
    const entry = await writeAudit("read", ids, { inverse: "mark-unread" });
    return NextResponse.json({ ok: true, applied: ids.length, auditId: entry.id });
  }

  // ── simple flag moves ──
  const spec = SIMPLE[kind];
  if (!spec) return badRequest(`unknown action kind: ${body.kind ?? "(missing)"}`);
  await prisma.message.updateMany({ where: { id: { in: ids } }, data: spec.apply });
  const detail: Record<string, unknown> = { inverse: spec.inverse };
  if (kind === "star" || kind === "unstar") detail.flag = "isStarred";
  const entry = await writeAudit(spec.audit, ids, detail);
  return NextResponse.json({ ok: true, applied: ids.length, auditId: entry.id });
}
