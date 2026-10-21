import { cache } from "react";
import { prisma } from "@/lib/db";
import { semanticSearchMessages } from "@dzong/sync-engine";
import { serializeMessage } from "@/components/mail/types";
import { getKeptSubscriptions, getNoReplySenders } from "@/lib/settings";
import type { Message, Prisma } from "@dzong/database";

export type MailView =
  | "inbox"
  | "starred"
  | "snoozed"
  | "drafts"
  | "sent"
  | "archive"
  | "newsletters"
  | "needs-reply"
  | "awaiting"
  | "reply-queue"
  | "review"
  | "digest";

export const VIEW_LABELS: Record<MailView, string> = {
  inbox: "Inbox",
  starred: "Starred",
  snoozed: "Snoozed",
  drafts: "Drafts",
  sent: "Sent",
  archive: "Archive",
  newsletters: "Newsletters",
  "needs-reply": "Needs reply",
  awaiting: "Awaiting reply",
  "reply-queue": "Reply queue",
  review: "AI review",
  digest: "Digest",
};

export function parseView(raw: string | undefined): MailView {
  return raw && raw in VIEW_LABELS ? (raw as MailView) : "inbox";
}

export async function getAccounts() {
  return prisma.emailAccount.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { messages: true } } },
  });
}

export function viewWhere(view: MailView): Prisma.MessageWhereInput {
  const base: Prisma.MessageWhereInput = { isDraft: view === "drafts" };
  switch (view) {
    case "inbox":
      return {
        ...base,
        isArchived: false,
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }],
      };
    case "starred":
      return { isStarred: true, isArchived: false, isDraft: false };
    case "snoozed":
      return { isDraft: false, snoozedUntil: { gt: new Date() } };
    case "drafts":
      return { isDraft: true };
    case "sent":
      return { folder: "Sent", isDraft: false };
    case "archive":
      return { isArchived: true, isDraft: false };
    case "newsletters":
      return {
        isDraft: false,
        OR: [
          { aiLabels: { has: "NEWSLETTER" } },
          { providerLabels: { hasSome: ["NEWSLETTER", "CATEGORY_PROMOTIONS"] } },
        ],
      };
    // Low-confidence AI decisions held for human approval.
    case "review":
      return { isDraft: false, aiDecisions: { some: { status: "queued" } } };
    case "digest":
      return {
        isDraft: false,
        isArchived: false,
        receivedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        OR: [
          { aiLabels: { hasSome: ["NEWSLETTER", "MARKETING", "COLD_PITCH"] } },
          { providerLabels: { hasSome: ["NEWSLETTER", "CATEGORY_PROMOTIONS"] } },
        ],
      };
    default:
      return { isArchived: false, isDraft: false };
  }
}

function searchWhere(q: string): Prisma.MessageWhereInput {
  const trimmed = q.trim().toLowerCase();
  if (trimmed === "is:unread") return { isRead: false };
  if (trimmed === "is:read") return { isRead: true };
  if (trimmed === "is:starred") return { isStarred: true };
  // file:<term> searches attachment names and their extracted text.
  const fileMatch = /^file:(.+)$/.exec(trimmed);
  if (fileMatch) {
    const term = fileMatch[1].trim();
    return {
      attachments: {
        some: {
          OR: [
            { filename: { contains: term, mode: "insensitive" } },
            { contentText: { contains: term, mode: "insensitive" } },
          ],
        },
      },
    };
  }
  // Also surface attachment hits inside a plain query - "find the contract"
  // should reach files, not just subjects.
  const attachmentHit = {
    attachments: {
      some: {
        OR: [
          { filename: { contains: q, mode: "insensitive" as const } },
          { contentText: { contains: q, mode: "insensitive" as const } },
        ],
      },
    },
  };
  return {
    OR: [
      { subject: { contains: q, mode: "insensitive" } },
      { fromAddress: { contains: q, mode: "insensitive" } },
      { fromName: { contains: q, mode: "insensitive" } },
      { snippet: { contains: q, mode: "insensitive" } },
      { bodyText: { contains: q, mode: "insensitive" } },
      attachmentHit,
    ],
  };
}

export async function getMessagesForView(
  view: MailView,
  q?: string,
  take = 100,
  accountId?: string,
  filter?: "unread" | "attachments",
) {
  const filterWhere: Prisma.MessageWhereInput[] =
    filter === "unread"
      ? [{ isRead: false }]
      : filter === "attachments"
        ? [{ hasAttachment: true }]
        : [];
  const where = {
    AND: [
      viewWhere(view),
      ...(q ? [searchWhere(q)] : []),
      ...(accountId ? [{ emailAccountId: accountId }] : []),
      ...filterWhere,
    ],
  };
  return prisma.message.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take,
    include: { emailAccount: { select: { emailAddress: true, provider: true } } },
  });
}

/** Semantic (embedding) search across the local user's mail. */
export async function searchMessagesSemantic(q: string, take = 50) {
  const user = await getLocalUser();
  if (!user) return { ok: false as const, hits: [], reason: "no local user" };
  const result = await semanticSearchMessages(user.id, q, prisma, { limit: take });
  return {
    ok: result.ok,
    reason: result.reason,
    hits: result.hits.map((h) => ({ ...serializeMessage(h.message), score: h.score })),
  };
}

export async function getMessagesForLabel(label: string, take = 100, accountId?: string) {
  return prisma.message.findMany({
    where: {
      OR: [{ labels: { has: label } }, { aiLabels: { has: label } }],
      isDraft: false,
      ...(accountId ? { emailAccountId: accountId } : {}),
    },
    orderBy: { receivedAt: "desc" },
    take,
    include: { emailAccount: { select: { emailAddress: true, provider: true } } },
  });
}

export async function getMessagesForFolder(folder: string, take = 100, accountId?: string) {
  return prisma.message.findMany({
    where: { folder, isDraft: false, ...(accountId ? { emailAccountId: accountId } : {}) },
    orderBy: { receivedAt: "desc" },
    take,
    include: { emailAccount: { select: { emailAddress: true, provider: true } } },
  });
}

export async function getThread(threadId: string) {
  return prisma.message.findMany({
    where: { threadId },
    orderBy: { receivedAt: "asc" },
    include: {
      emailAccount: { select: { emailAddress: true } },
      attachments: { orderBy: { createdAt: "asc" } },
      aiDecisions: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
  });
}

export interface DigestSender {
  fromAddress: string;
  fromName: string | null;
  count: number;
  latestSubject: string | null;
  latestThreadId: string | null;
  latestReceivedAt: string;
}

/** Bulk/newsletter senders from the last N days, grouped for the digest view. */
export async function getDigestSenders(days = 7): Promise<DigestSender[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.message.findMany({
    where: {
      isDraft: false,
      isArchived: false,
      receivedAt: { gte: since },
      OR: [
        { aiLabels: { hasSome: ["NEWSLETTER", "MARKETING", "COLD_PITCH"] } },
        { providerLabels: { hasSome: ["NEWSLETTER", "CATEGORY_PROMOTIONS"] } },
      ],
    },
    orderBy: { receivedAt: "desc" },
    select: {
      fromAddress: true,
      fromName: true,
      subject: true,
      threadId: true,
      receivedAt: true,
    },
  });

  const bySender = new Map<string, DigestSender>();
  for (const m of rows) {
    const existing = bySender.get(m.fromAddress);
    if (existing) existing.count++;
    else {
      bySender.set(m.fromAddress, {
        fromAddress: m.fromAddress,
        fromName: m.fromName,
        count: 1,
        latestSubject: m.subject,
        latestThreadId: m.threadId,
        latestReceivedAt: m.receivedAt.toISOString(),
      });
    }
  }
  return [...bySender.values()].sort((a, b) => b.count - a.count);
}

export interface ThreadSummary {
  threadId: string;
  latest: Message & { emailAccount: { emailAddress: string; provider: string } };
  count: number;
}

/** Group recent messages into threads and return those whose latest message
 *  is (awaiting) or isn't (needs-reply) sent by the account owner. For
 *  needs-reply, senders the user permanently dismissed ("no reply needed,
 *  always") are filtered out — so the view, the queue and the sidebar
 *  counts all recalculate from one place. */
export async function getFollowUpThreads(kind: "awaiting" | "needs-reply", accountId?: string) {
  const messages = await prisma.message.findMany({
    where: {
      isArchived: false,
      isDraft: false,
      threadId: { not: null },
      ...(accountId ? { emailAccountId: accountId } : {}),
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }],
    },
    orderBy: { receivedAt: "desc" },
    take: 500,
    include: { emailAccount: { select: { emailAddress: true, provider: true } } },
  });

  const threads = new Map<string, (typeof messages)[number][]>();
  for (const m of messages) {
    const list = threads.get(m.threadId!) ?? [];
    list.push(m);
    threads.set(m.threadId!, list);
  }

  const own = new Set(messages.map((m) => m.emailAccount.emailAddress.toLowerCase()));
  const suppressed =
    kind === "needs-reply" ? new Set(await getNoReplySenders()) : new Set<string>();
  const out: ThreadSummary[] = [];
  for (const [threadId, list] of threads) {
    const latest = list[0]; // already desc
    const fromMe = own.has(latest.fromAddress.toLowerCase());
    if (
      (kind === "awaiting" && fromMe) ||
      (kind === "needs-reply" && !fromMe && !suppressed.has(latest.fromAddress.toLowerCase()))
    ) {
      out.push({ threadId, latest, count: list.length });
    }
  }
  return out;
}

export interface ReplyQueueItem {
  thread: ThreadSummary;
  /** Pending draft already written for this thread (AI or manual), if any. */
  draft: Message | null;
}

/** Threads waiting on the owner's reply, newest first, each paired with its
 *  pending draft — the review surface behind the rail's AI icon. Cached per
 *  render so the rail badge, list pane, and queue panel share one scan. */
export const getReplyQueue = cache(async (): Promise<ReplyQueueItem[]> => {
  const threads = await getFollowUpThreads("needs-reply");
  const top = threads.slice(0, 25);
  const drafts = await prisma.message.findMany({
    where: { threadId: { in: top.map((t) => t.threadId) }, isDraft: true },
    orderBy: { receivedAt: "desc" },
  });
  return top.map((thread) => ({
    thread,
    draft: drafts.find((d) => d.threadId === thread.threadId) ?? null,
  }));
});

export interface SidebarData {
  counts: Record<MailView, number>;
  folders: string[];
  labels: string[];
}

export async function getSidebarData(): Promise<SidebarData> {
  const [counts, folders, labelRows] = await Promise.all([
    Promise.all(
      (Object.keys(VIEW_LABELS) as MailView[]).map(async (view) => {
        if (view === "needs-reply" || view === "awaiting" || view === "reply-queue") {
          const threads = await getFollowUpThreads(
            view === "awaiting" ? "awaiting" : "needs-reply",
          );
          return threads.length;
        }
        return prisma.message.count({ where: viewWhere(view) });
      }),
    ),
    prisma.message.findMany({
      where: { folder: { not: null } },
      select: { folder: true },
      distinct: ["folder"],
    }),
    prisma.message.findMany({
      select: { labels: true, aiLabels: true },
      take: 500,
    }),
  ]);

  const labels = new Set<string>();
  for (const row of labelRows) {
    for (const l of row.labels) labels.add(l);
    for (const l of row.aiLabels) labels.add(l);
  }

  return {
    counts: Object.fromEntries(
      (Object.keys(VIEW_LABELS) as MailView[]).map((v, i) => [v, counts[i]]),
    ) as Record<MailView, number>,
    folders: folders.map((f) => f.folder!).sort(),
    labels: [...labels].sort(),
  };
}

export interface SubscriptionSummary {
  fromAddress: string;
  fromName: string | null;
  count: number;
  unread: number;
  /** 0-100 — share of their mail the user actually opened. */
  readPct: number;
  lastReceivedAt: string; // ISO
  canUnsubscribe: boolean;
  unsubscribed: boolean;
  /** Marked "keep" — pinned out of the suggestion ranking. */
  kept: boolean;
  /** High-volume, low read-rate — the one-click-cut candidate set. */
  suggested: boolean;
}

/** Group bulk senders (newsletters/promotions/List-Unsubscribe mail) for the
 *  subscriptions manager — the bulk-unsubscribe surface. Suggested cuts are
 *  senders whose mail mostly goes unread; kept senders sort to the bottom. */
export async function getSubscriptions(): Promise<SubscriptionSummary[]> {
  const [messages, kept] = await Promise.all([
    prisma.message.findMany({
      where: { isDraft: false },
      orderBy: { receivedAt: "desc" },
      take: 1000,
      select: {
        fromAddress: true,
        fromName: true,
        isRead: true,
        receivedAt: true,
        headers: true,
        labels: true,
        aiLabels: true,
        providerLabels: true,
      },
    }),
    getKeptSubscriptions(),
  ]);
  const keptSet = new Set(kept.map((s) => s.toLowerCase()));

  const senders = new Map<
    string,
    Omit<SubscriptionSummary, "readPct" | "lastReceivedAt" | "kept" | "suggested"> & {
      lastReceivedAt: Date;
    }
  >();
  for (const m of messages) {
    const h = (m.headers ?? {}) as Record<string, string>;
    const hasUnsubHeader = Boolean(h["List-Unsubscribe"] ?? h["list-unsubscribe"]);
    const isBulk =
      hasUnsubHeader ||
      m.aiLabels.some((l) => l === "NEWSLETTER" || l === "MARKETING") ||
      m.providerLabels.some((l) => l === "NEWSLETTER" || l === "CATEGORY_PROMOTIONS");
    if (!isBulk) continue;

    const s = senders.get(m.fromAddress) ?? {
      fromAddress: m.fromAddress,
      fromName: m.fromName,
      count: 0,
      unread: 0,
      lastReceivedAt: m.receivedAt,
      canUnsubscribe: false,
      unsubscribed: false,
    };
    s.count++;
    if (!m.isRead) s.unread++;
    if (hasUnsubHeader) s.canUnsubscribe = true;
    if (m.labels.includes("UNSUBSCRIBED")) s.unsubscribed = true;
    senders.set(m.fromAddress, s);
  }
  return [...senders.values()]
    .map((s) => {
      const readPct = s.count > 0 ? Math.round(((s.count - s.unread) / s.count) * 100) : 0;
      const isKept = keptSet.has(s.fromAddress.toLowerCase());
      return {
        ...s,
        readPct,
        lastReceivedAt: s.lastReceivedAt.toISOString(),
        kept: isKept,
        suggested: !isKept && !s.unsubscribed && s.count >= 3 && readPct < 35,
      };
    })
    .sort((a, b) =>
      a.kept !== b.kept
        ? a.kept
          ? 1
          : -1
        : a.suggested !== b.suggested
          ? a.suggested
            ? -1
            : 1
          : b.count - a.count,
    );
}

const BULK_LABELS = new Set(["NEWSLETTER", "MARKETING", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"]);

/** Group serialized inbox items into split-inbox sections (Superhuman-style):
 *  Priority → Newsletters & bulk → Everything else by default, or the
 *  user's own pinned label sections when they've configured splits. */
export function splitInboxGroups(
  items: {
    id: string;
    isRead: boolean;
    isStarred: boolean;
    aiLabels: string[];
    providerLabels: string[];
    labels?: string[];
  }[],
  splitLabels?: string[],
): { title: string; ids: string[] }[] {
  // Custom splits: one section per pinned label, remainder underneath.
  if (splitLabels && splitLabels.length > 0) {
    const used = new Set<string>();
    const sections = splitLabels.map((label) => {
      const ids = items
        .filter((m) => {
          const has = (m.labels ?? []).includes(label) || m.aiLabels.includes(label);
          if (has) used.add(m.id);
          return has;
        })
        .map((m) => m.id);
      return { title: `#${label}`, ids };
    });
    const rest = items.filter((m) => !used.has(m.id)).map((m) => m.id);
    return [...sections, { title: "Everything else", ids: rest }].filter((s) => s.ids.length > 0);
  }

  const priority: string[] = [];
  const bulk: string[] = [];
  const rest: string[] = [];
  for (const m of items) {
    const isBulk =
      m.aiLabels.some((l) => l === "NEWSLETTER" || l === "MARKETING") ||
      m.providerLabels.some((l) => BULK_LABELS.has(l));
    if (m.isStarred || (!isBulk && !m.isRead)) priority.push(m.id);
    else if (isBulk) bulk.push(m.id);
    else rest.push(m.id);
  }
  return [
    { title: "Priority", ids: priority },
    { title: "Newsletters & bulk", ids: bulk },
    { title: "Everything else", ids: rest },
  ].filter((s) => s.ids.length > 0);
}

export async function getRules() {
  return prisma.automationRule.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: { emailAccount: { select: { emailAddress: true } } },
  });
}

export async function getLocalUser() {
  return prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    include: { aiSettings: true },
  });
}
