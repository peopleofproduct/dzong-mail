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
