import { prisma } from "@/lib/db";
import type { Message, Prisma } from "@unwalled/database";

export type MailView =
  | "inbox"
  | "starred"
  | "snoozed"
  | "drafts"
  | "sent"
  | "archive"
  | "newsletters"
  | "needs-reply"
  | "awaiting";

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

function viewWhere(view: MailView): Prisma.MessageWhereInput {
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
    default:
      return { isArchived: false, isDraft: false };
  }
}

function searchWhere(q: string): Prisma.MessageWhereInput {
  return {
    OR: [
      { subject: { contains: q, mode: "insensitive" } },
      { fromAddress: { contains: q, mode: "insensitive" } },
      { fromName: { contains: q, mode: "insensitive" } },
      { snippet: { contains: q, mode: "insensitive" } },
      { bodyText: { contains: q, mode: "insensitive" } },
    ],
  };
}

export async function getMessagesForView(view: MailView, q?: string, take = 100) {
  const where = { AND: [viewWhere(view), ...(q ? [searchWhere(q)] : [])] };
  return prisma.message.findMany({
    where,
    orderBy: { receivedAt: "desc" },
    take,
    include: { emailAccount: { select: { emailAddress: true, provider: true } } },
  });
}

export async function getMessagesForLabel(label: string, take = 100) {
  return prisma.message.findMany({
    where: {
      OR: [{ labels: { has: label } }, { aiLabels: { has: label } }],
      isDraft: false,
    },
    orderBy: { receivedAt: "desc" },
    take,
    include: { emailAccount: { select: { emailAddress: true, provider: true } } },
  });
}

export async function getMessagesForFolder(folder: string, take = 100) {
  return prisma.message.findMany({
    where: { folder, isDraft: false },
    orderBy: { receivedAt: "desc" },
    take,
    include: { emailAccount: { select: { emailAddress: true, provider: true } } },
  });
}

export async function getThread(threadId: string) {
  return prisma.message.findMany({
    where: { threadId },
    orderBy: { receivedAt: "asc" },
    include: { emailAccount: { select: { emailAddress: true } } },
  });
}

export interface ThreadSummary {
  threadId: string;
  latest: Message & { emailAccount: { emailAddress: string } };
  count: number;
}

/** Group recent messages into threads and return those whose latest message
 *  is (awaiting) or isn't (needs-reply) sent by the account owner. */
export async function getFollowUpThreads(kind: "awaiting" | "needs-reply") {
  const messages = await prisma.message.findMany({
    where: {
      isArchived: false,
      isDraft: false,
      threadId: { not: null },
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }],
    },
    orderBy: { receivedAt: "desc" },
    take: 500,
    include: { emailAccount: { select: { emailAddress: true } } },
  });

  const threads = new Map<string, (typeof messages)[number][]>();
  for (const m of messages) {
    const list = threads.get(m.threadId!) ?? [];
    list.push(m);
    threads.set(m.threadId!, list);
  }

  const own = new Set(messages.map((m) => m.emailAccount.emailAddress.toLowerCase()));
  const out: ThreadSummary[] = [];
  for (const [threadId, list] of threads) {
    const latest = list[0]; // already desc
    const fromMe = own.has(latest.fromAddress.toLowerCase());
    if ((kind === "awaiting" && fromMe) || (kind === "needs-reply" && !fromMe)) {
      out.push({ threadId, latest, count: list.length });
    }
  }
  return out;
}

export interface SidebarData {
  counts: Record<MailView, number>;
  folders: string[];
  labels: string[];
}

export async function getSidebarData(): Promise<SidebarData> {
  const [counts, folders, labelRows] = await Promise.all([
    Promise.all(
      (Object.keys(VIEW_LABELS) as MailView[]).map(async (view) => {
        if (view === "needs-reply" || view === "awaiting") {
          const threads = await getFollowUpThreads(view);
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
  canUnsubscribe: boolean;
  unsubscribed: boolean;
}

/** Group bulk senders (newsletters/promotions/List-Unsubscribe mail) for the
 *  subscriptions manager — the bulk-unsubscribe surface. */
export async function getSubscriptions(): Promise<SubscriptionSummary[]> {
  const messages = await prisma.message.findMany({
    where: { isDraft: false },
    orderBy: { receivedAt: "desc" },
    take: 1000,
    select: {
      fromAddress: true,
      fromName: true,
      isRead: true,
      headers: true,
      labels: true,
      aiLabels: true,
      providerLabels: true,
    },
  });

  const senders = new Map<string, SubscriptionSummary>();
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
      canUnsubscribe: false,
      unsubscribed: false,
    };
    s.count++;
    if (!m.isRead) s.unread++;
    if (hasUnsubHeader) s.canUnsubscribe = true;
    if (m.labels.includes("UNSUBSCRIBED")) s.unsubscribed = true;
    senders.set(m.fromAddress, s);
  }
  return [...senders.values()].sort((a, b) => b.count - a.count);
}

const BULK_LABELS = new Set(["NEWSLETTER", "MARKETING", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"]);

/** Group serialized inbox items into split-inbox sections (Superhuman-style):
 *  Priority → Newsletters & bulk → Everything else. */
export function splitInboxGroups(
  items: {
    id: string;
    isRead: boolean;
    isStarred: boolean;
    aiLabels: string[];
    providerLabels: string[];
  }[],
): { title: string; ids: string[] }[] {
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

export interface AnalyticsData {
  total: number;
  unread: number;
  needsReply: number;
  awaiting: number;
  snoozed: number;
  drafts: number;
  aiDrafts: number;
  daily: { date: string; count: number }[];
  topSenders: { address: string; name: string | null; count: number }[];
  labelCounts: { label: string; count: number; ai: boolean }[];
}

/** Aggregate local stats for the analytics dashboard — all from local data. */
export async function getAnalyticsData(days = 14): Promise<AnalyticsData> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [total, unread, snoozed, drafts, aiDrafts, recent, senders, labelRows] = await Promise.all([
    prisma.message.count({ where: { isDraft: false } }),
    prisma.message.count({ where: { isRead: false, isDraft: false, isArchived: false } }),
    prisma.message.count({ where: { snoozedUntil: { gt: new Date() } } }),
    prisma.message.count({ where: { isDraft: true } }),
    prisma.message.count({ where: { providerLabels: { has: "AI_DRAFT" } } }),
    prisma.message.findMany({
      where: { receivedAt: { gte: since }, isDraft: false },
      select: { receivedAt: true },
    }),
    prisma.message.groupBy({
      by: ["fromAddress", "fromName"],
      where: { isDraft: false },
      _count: { _all: true },
      orderBy: { _count: { fromAddress: "desc" } },
      take: 8,
    }),
    prisma.message.findMany({
      where: { isDraft: false },
      select: { labels: true, aiLabels: true },
      take: 2000,
    }),
  ]);

  const perDay = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    perDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const m of recent) {
    const key = m.receivedAt.toISOString().slice(0, 10);
    if (perDay.has(key)) perDay.set(key, perDay.get(key)! + 1);
  }

  const labelMap = new Map<string, { count: number; ai: boolean }>();
  for (const row of labelRows) {
    for (const l of row.labels) {
      const e = labelMap.get(l) ?? { count: 0, ai: false };
      e.count++;
      labelMap.set(l, e);
    }
    for (const l of row.aiLabels) {
      const e = labelMap.get(l) ?? { count: 0, ai: true };
      e.count++;
      e.ai = true;
      labelMap.set(l, e);
    }
  }

  const [needsReplyThreads, awaitingThreads] = await Promise.all([
    getFollowUpThreads("needs-reply"),
    getFollowUpThreads("awaiting"),
  ]);

  return {
    total,
    unread,
    needsReply: needsReplyThreads.length,
    awaiting: awaitingThreads.length,
    snoozed,
    drafts,
    aiDrafts,
    daily: [...perDay.entries()].map(([date, count]) => ({ date, count })),
    topSenders: senders.map((s) => ({
      address: s.fromAddress,
      name: s.fromName,
      count: s._count._all,
    })),
    labelCounts: [...labelMap.entries()]
      .map(([label, v]) => ({ label, count: v.count, ai: v.ai }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  };
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
