import { prisma } from "@dzong/database";
import type { PrismaClient } from "@dzong/database";
import { draftAiReply } from "./drafts";

async function readSetting<T>(db: PrismaClient, key: string, fallback: T): Promise<T> {
  const row = await db.appSetting.findUnique({ where: { key } }).catch(() => null);
  return row !== null && row.value !== null ? (row.value as T) : fallback;
}

/**
 * Local notification log — the worker and send pipeline write rows here,
 * the web UI polls them for the bell and (with permission) mirrors them to
 * desktop notifications. dedupeKey makes recurring checks idempotent:
 * e.g. one follow-up nudge per thread per day.
 */
export async function emit(
  input: {
    kind: "new-mail" | "follow-up" | "send" | "agent" | "system" | "read-receipt" | "routine";
    title: string;
    body?: string;
    messageId?: string;
    threadId?: string;
    dedupeKey?: string;
  },
  db: PrismaClient = prisma,
): Promise<void> {
  try {
    if (input.dedupeKey) {
      await db.notification.upsert({
        where: { dedupeKey: input.dedupeKey },
        update: {},
        create: { ...input, dedupeKey: input.dedupeKey },
      });
    } else {
      await db.notification.create({ data: input });
    }
  } catch (err) {
    // Notifications must never break the flow that raised them.
    console.error("[notify] emit failed:", err);
  }
}

/** One notification per sync batch - "3 new messages from X". */
export async function notifyNewMail(
  accountId: string,
  inserted: number,
  db: PrismaClient = prisma,
): Promise<void> {
  if (inserted === 0) return;
  const account = await db.emailAccount.findUnique({
    where: { id: accountId },
    select: { displayName: true, emailAddress: true },
  });
  await emit(
    {
      kind: "new-mail",
      title: `${inserted} new message${inserted === 1 ? "" : "s"}`,
      body: account?.displayName ?? account?.emailAddress ?? "inbox",
    },
    db,
  );
}

/** Labels that mark a message as bulk/noise — never worth an OS toast. */
const NOISE_LABELS = new Set(["NEWSLETTER", "MARKETING", "COLD_PITCH", "SOCIAL", "NOTIFICATION"]);

/** Fallback for unclassified mail (AI off): obvious bulk senders by
 *  address convention. */
const BULK_SENDER =
  /^(?:no-?reply|newsletter|marketing|promo|promotions|notifications?|alerts?|digest|updates?|news|bounce|mailer-daemon|postmaster)@/i;

/** Max individual toasts per sync batch — beyond this, one summary row. */
const MAX_MAIL_TOASTS = 5;

/**
 * Smart new-mail notifications: emit only for messages worth interrupting
 * for. Called AFTER post-sync classification so aiLabels are settled.
 *
 * A message notifies when:
 *  - the sender is on the VIP list (vipSenders setting), or
 *  - it carries ACTION_REQUIRED, or
 *  - it has no noise label — and when AI produced no labels at all, it
 *    must also pass bulk-mail heuristics (List-Unsubscribe/List-Id,
 *    Precedence: bulk|list|junk, noreply-style senders).
 * Non-inbox folders (your own Sent copies syncing down) and
 * rule-archived mail never notify.
 *
 * `notifyAllMail` setting restores the old one-batch-toast behaviour.
 */
export async function notifyImportantMail(
  accountId: string,
  insertedIds: string[],
  db: PrismaClient = prisma,
): Promise<void> {
  if (insertedIds.length === 0) return;
  if (await readSetting<boolean>(db, "notifyAllMail", false)) {
    return notifyNewMail(accountId, insertedIds.length, db);
  }
  const vip = new Set(
    (await readSetting<string[]>(db, "vipSenders", [])).map((s) => s.toLowerCase()),
  );
  const rows = await db.message.findMany({
    where: { id: { in: insertedIds }, isDraft: false },
    select: {
      id: true,
      subject: true,
      fromName: true,
      fromAddress: true,
      threadId: true,
      labels: true,
      aiLabels: true,
      headers: true,
      isArchived: true,
      folder: true,
    },
  });
  const important = rows.filter((m) => {
    const from = (m.fromAddress ?? "").toLowerCase();
    if (vip.has(from)) return true;
    // Only inbox arrivals are "new mail" — synced Sent/other folders aren't.
    if (m.folder && !/inbox/i.test(m.folder)) return false;
    if (m.isArchived) return false; // a rule already triaged it
    const tags = new Set([...m.labels, ...m.aiLabels]);
    if (tags.has("ACTION_REQUIRED")) return true;
    for (const t of tags) if (NOISE_LABELS.has(t)) return false;
    if (tags.size === 0) {
      // AI off or couldn't classify — apply bulk-mail heuristics.
      const h = (m.headers ?? {}) as Record<string, string>;
      if (h["List-Unsubscribe"] || h["List-Id"]) return false;
      const precedence = (h["Precedence"] ?? "").toLowerCase();
      if (["bulk", "list", "junk"].includes(precedence)) return false;
      if (BULK_SENDER.test(from)) return false;
    }
    return true;
  });

  for (const m of important.slice(0, MAX_MAIL_TOASTS)) {
    await emit(
      {
        kind: "new-mail",
        title: `New from ${m.fromName ?? m.fromAddress}`,
        body: m.subject ?? "(no subject)",
        messageId: m.id,
        threadId: m.threadId ?? undefined,
        dedupeKey: `newmail:${m.id}`,
      },
      db,
    );
  }
  if (important.length > MAX_MAIL_TOASTS) {
    const extra = important.length - MAX_MAIL_TOASTS;
    await emit(
      {
        kind: "new-mail",
        title: `+${extra} more important message${extra === 1 ? "" : "s"}`,
        dedupeKey: `newmail-extra:${accountId}:${dayKey(new Date())}`,
      },
      db,
    );
  }
}

const dayKey = (d: Date) => d.toLocaleDateString("sv-SE");

/**
 * Follow-up reminders: threads where the user's last message has gone
 * unanswered beyond `days`. One nudge per thread per day via dedupeKey.
 */
/**
 * Median hour-of-day a recipient tends to send mail, learned from their
 * last 200 messages in our local store. Returns the next occurrence of
 * that hour (today if still ahead, else tomorrow), or null when there
 * are fewer than 3 samples to learn from.
 */
async function recipientNextActiveHour(
  toAddresses: string[],
  own: Set<string>,
  db: PrismaClient,
): Promise<Date | null> {
  const recipient = toAddresses.find((a) => !own.has(a.toLowerCase()));
  if (!recipient) return null;
  const replies = await db.message.findMany({
    where: { fromAddress: { equals: recipient, mode: "insensitive" }, isDraft: false },
    orderBy: { receivedAt: "desc" },
    take: 200,
    select: { receivedAt: true },
  });
  if (replies.length < 3) return null;
  const hours = replies.map((r) => r.receivedAt.getHours()).sort((a, b) => a - b);
  const median = hours[Math.floor(hours.length / 2)];
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(median);
  if (next.getTime() <= Date.now() + 5 * 60_000) next.setDate(next.getDate() + 1);
  return next;
}

/**
 * Follow-up reminders: threads where the user's last message has gone
 * unanswered beyond `days`. One nudge per thread per day via dedupeKey.
 */
export async function checkFollowUpReminders(
  db: PrismaClient = prisma,
  days?: number,
): Promise<number> {
  // The Settings UI stores the threshold in AppSetting; an explicit argument
  // (or its absence) falls back to the worker env / 3 days.
  let effectiveDays = days ?? 3;
  if (days === undefined) {
    const stored = await db.appSetting
      .findUnique({ where: { key: "followUpDays" } })
      .catch(() => null);
    if (typeof stored?.value === "number" && stored.value >= 1) {
      effectiveDays = stored.value;
    }
  }
  const cutoff = new Date(Date.now() - effectiveDays * 86400000);
  // autoFollowUp: "off" just reminds (default), "draft" prepares an AI
  // nudge, "send" queues the nudge through the undo window.
  const autoMode = await readSetting<string>(db, "autoFollowUp", "off");
  const undoSeconds =
    autoMode === "send" ? await readSetting<number>(db, "undoSendSeconds", 15) : 0;
  const accounts = await db.emailAccount.findMany({
    select: { id: true, emailAddress: true },
  });
  const own = new Set(accounts.map((a) => a.emailAddress.toLowerCase()));

  // Latest message per thread, sent by the user, older than the cutoff.
  const candidates = await db.message.findMany({
    where: {
      isDraft: false,
      isArchived: false,
      threadId: { not: null },
      fromAddress: { in: [...own] },
      receivedAt: { lt: cutoff },
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }],
    },
    orderBy: { receivedAt: "desc" },
    take: 500,
  });

  // Keep only threads where MY message is still the latest activity.
  const candidateThreads = [
    ...new Set(candidates.map((m) => m.threadId).filter((t): t is string => Boolean(t))),
  ];
  const latestByThread = await db.message.findMany({
    where: {
      threadId: { in: candidateThreads },
      isDraft: false,
    },
    orderBy: { receivedAt: "desc" },
    select: {
      threadId: true,
      fromAddress: true,
      toAddresses: true,
      subject: true,
      receivedAt: true,
      id: true,
    },
  });
  const seen = new Set<string>();
  let nudged = 0;
  for (const m of latestByThread) {
    if (!m.threadId || seen.has(m.threadId)) continue;
    seen.add(m.threadId);
    if (!own.has(m.fromAddress.toLowerCase())) continue; // they replied since
    if (m.receivedAt >= cutoff) continue;
    const ageDays = Math.floor((Date.now() - m.receivedAt.getTime()) / 86400000);
    await emit(
      {
        kind: "follow-up",
        title: `No reply in ${ageDays} days`,
        body: m.subject ?? "(no subject)",
        messageId: m.id,
        threadId: m.threadId,
        dedupeKey: `followup:${m.threadId}:${dayKey(new Date())}`,
      },
      db,
    );
    nudged++;

    // Auto follow-up: draft (or queue) exactly one nudge per thread, ever.
    if (autoMode === "off") continue;
    const marker = await db.notification.findUnique({
      where: { dedupeKey: `autofu:${m.threadId}` },
    });
    if (marker) continue;
    try {
      const draft = await draftAiReply(m.id, db);
      if (!draft.ok || !draft.draftId) continue;
      if (autoMode === "send") {
        // Adaptive timing: if we know this recipient's reply cadence,
        // schedule the nudge for their next typical-open hour instead of
        // firing immediately. Falls back to the plain undo window.
        const sendAt =
          (await recipientNextActiveHour(m.toAddresses, own, db)) ??
          new Date(Date.now() + undoSeconds * 1000);
        await db.message.update({
          where: { id: draft.draftId },
          data: { scheduledAt: sendAt },
        });
      }
      await db.aiDecision
        .create({
          data: {
            messageId: m.id,
            kind: "follow-up",
            action: autoMode === "send" ? "auto-sent nudge" : "drafted nudge",
            reason: `No reply in ${ageDays} days; threshold ${effectiveDays}`,
            status: "applied",
          },
        })
        .catch(() => null);
      await emit(
        {
          kind: "follow-up",
          title:
            autoMode === "send"
              ? "Follow-up queued - undo window applies"
              : "Follow-up draft ready",
          body: m.subject ?? "(no subject)",
          messageId: draft.draftId,
          threadId: m.threadId,
          dedupeKey: `autofu:${m.threadId}`,
        },
        db,
      );
    } catch (err) {
      console.error(`[follow-up] auto-draft failed for ${m.threadId}:`, err);
    }
  }
  return nudged;
}

/** Audit row for the overnight-agent briefing. */
export async function recordAgentRun(
  kind: string,
  summary: Record<string, number | string | boolean>,
  db: PrismaClient = prisma,
): Promise<void> {
  try {
    await db.agentRun.create({ data: { kind, summary } });
  } catch (err) {
    console.error("[agent] run log failed:", err);
  }
}
