import { prisma } from "@/lib/db";
import { getFollowUpThreads } from "@/lib/queries";
import { getAchievementStats } from "@/lib/achievements";

export interface Insights {
  healthScore: number;
  healthParts: { label: string; score: number; weight: number; detail: string }[];
  weekly: { label: string; count: number }[];
  /** 7 days (Mon-Sun) x 24 hours - receivedAt counts, last 90 days. */
  heatmap: number[][];
  categories: { label: string; count: number; pct: number; tone: string }[];
  topSenders: { name: string; address: string; count: number; pct: number }[];
  topRecipients: { name: string; address: string; count: number; pct: number }[];
  flow: { received: number; handled: number; sent: number; periodDays: number };
  replyDebt: { bucket: string; count: number }[];
  replyDebtOldestDays: number;
  insights: {
    tone: "good" | "warn" | "alert" | "info";
    text: string;
    cta?: { label: string; href: string };
  }[];
  totals: {
    total: number;
    unread: number;
    needsReply: number;
    awaiting: number;
    snoozed: number;
    clearStreak: number;
  };
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export { DAY_NAMES };

const CATEGORY_LABELS: Record<string, string> = {
  NEWSLETTER: "Newsletters",
  MARKETING: "Marketing",
  COLD_PITCH: "Cold pitches",
  RECEIPTS: "Receipts",
  FINANCE: "Finance",
  TRAVEL: "Travel",
  SOCIAL: "Social",
  UPDATES: "Updates",
  IMPORTANT: "Important",
  WORK: "Work",
  PERSONAL: "Personal",
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_UPDATES: "Updates",
  CATEGORY_FORUMS: "Forums",
};

const TONES = ["indigo", "emerald", "amber", "rose", "sky", "violet", "teal", "orange"];

export async function getInsights(): Promise<Insights> {
  const now = new Date();
  const d90 = new Date(now.getTime() - 90 * 86400000);
  const d30 = new Date(now.getTime() - 30 * 86400000);

  const [
    total,
    unread,
    snoozed,
    recent,
    labelRows,
    senderRows,
    received30,
    handled30,
    sent30,
    sentRecipientRows,
    needsReplyThreads,
    awaitingThreads,
    achievements,
  ] = await Promise.all([
    prisma.message.count({ where: { isDraft: false } }),
    prisma.message.count({ where: { isRead: false, isDraft: false, isArchived: false } }),
    prisma.message.count({ where: { snoozedUntil: { gt: now } } }),
    prisma.message.findMany({
      where: { receivedAt: { gte: d90 }, isDraft: false },
      select: { receivedAt: true },
    }),
    prisma.message.findMany({
      where: { isDraft: false },
      select: { labels: true, aiLabels: true, providerLabels: true },
      take: 4000,
    }),
    prisma.message.groupBy({
      by: ["fromAddress", "fromName"],
      where: { isDraft: false },
      _count: { _all: true },
      orderBy: { _count: { fromAddress: "desc" } },
      take: 7,
    }),
    prisma.message.count({ where: { isDraft: false, receivedAt: { gte: d30 } } }),
    prisma.message.count({ where: { isArchived: true, isDraft: false } }),
    prisma.message.count({ where: { folder: "Sent", isDraft: false, receivedAt: { gte: d30 } } }),
    prisma.message.findMany({
      where: { folder: "Sent", isDraft: false },
      select: { toAddresses: true },
      take: 2000,
    }),
    getFollowUpThreads("needs-reply"),
    getFollowUpThreads("awaiting"),
    getAchievementStats(),
  ]);

  // Weekly inflow - last 12 ISO-ish weeks ending this one.
  const weekly: { label: string; count: number }[] = [];
  const weekMs = 7 * 86400000;
  const weekStart = new Date(now.getTime() - 11 * weekMs);
  for (let i = 0; i < 12; i++) {
    const start = new Date(weekStart.getTime() + i * weekMs);
    weekly.push({
      label: `${start.toLocaleString("en", { month: "short" })} ${start.getDate()}`,
      count: 0,
    });
  }
  // Day-of-week x hour heatmap (Mon=0).
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const m of recent) {
    const t = m.receivedAt.getTime();
    if (t >= weekStart.getTime()) {
      const idx = Math.min(11, Math.floor((t - weekStart.getTime()) / weekMs));
      weekly[idx].count++;
    }
    const dow = (m.receivedAt.getDay() + 6) % 7; // Mon=0
    heatmap[dow][m.receivedAt.getHours()]++;
  }

  // Categories - friendly names, merged ai/provider labels, then "Other".
  const catMap = new Map<string, number>();
  for (const row of labelRows) {
    const names = new Set<string>();
    for (const l of [...row.labels, ...row.aiLabels]) {
      names.add(CATEGORY_LABELS[l] ?? l.charAt(0).toUpperCase() + l.slice(1).toLowerCase());
    }
    for (const l of row.providerLabels) {
      if (CATEGORY_LABELS[l]) names.add(CATEGORY_LABELS[l]);
    }
    if (names.size === 0) names.add("Uncategorized");
    for (const n of names) catMap.set(n, (catMap.get(n) ?? 0) + 1);
  }
  const catTotal = Math.max(
    1,
    [...catMap.values()].reduce((a, b) => a + b, 0),
  );
  const categories = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([label, count], i) => ({
      label,
      count,
      pct: Math.round((count / catTotal) * 100),
      tone: TONES[i % TONES.length],
    }));

  const senderTotal = Math.max(1, total);
  const topSenders = senderRows.map((s) => ({
    name: s.fromName ?? s.fromAddress,
    address: s.fromAddress,
    count: s._count._all,
    pct: Math.round((s._count._all / senderTotal) * 100),
  }));

  // Who the user writes TO — grouped recipients, display names borrowed
  // from their incoming mail when a bare address is all the Sent copy has.
  const recipCounts = new Map<string, number>();
  for (const m of sentRecipientRows) {
    for (const addr of m.toAddresses) {
      const a = addr.trim().toLowerCase();
      if (a.includes("@")) recipCounts.set(a, (recipCounts.get(a) ?? 0) + 1);
    }
  }
  const topRecipAddrs = [...recipCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([a]) => a);
  const recipNameRows =
    topRecipAddrs.length > 0
      ? await prisma.message.findMany({
          where: { fromAddress: { in: topRecipAddrs }, fromName: { not: null } },
          select: { fromAddress: true, fromName: true },
          distinct: ["fromAddress"],
          take: 20,
        })
      : [];
  const recipNames = new Map(recipNameRows.map((r) => [r.fromAddress.toLowerCase(), r.fromName!]));
  const sentTotal = Math.max(1, sentRecipientRows.length);
  const topRecipients = topRecipAddrs.map((address) => ({
    name: recipNames.get(address) ?? address,
    address,
    count: recipCounts.get(address) ?? 0,
    pct: Math.round(((recipCounts.get(address) ?? 0) / sentTotal) * 100),
  }));

  // Reply debt aging.
  const buckets = [
    { bucket: "< 1 day", max: 1 },
    { bucket: "1-3 days", max: 3 },
    { bucket: "3-7 days", max: 7 },
    { bucket: "7+ days", max: Infinity },
  ];
  const replyDebt = buckets.map((b) => ({ bucket: b.bucket, count: 0 }));
  let replyDebtOldestDays = 0;
  for (const t of needsReplyThreads) {
    const days = (now.getTime() - t.latest.receivedAt.getTime()) / 86400000;
    replyDebtOldestDays = Math.max(replyDebtOldestDays, Math.floor(days));
    const idx = buckets.findIndex((b) => days < b.max);
    replyDebt[idx === -1 ? buckets.length - 1 : idx].count++;
  }

  // Health score - explainable composite, 0-100.
  const processingRate = received30 > 0 ? Math.min(1, handled30 / received30) : 1;
  const unreadRatio = total > 0 ? unread / total : 0;
  const debtRatio = total > 0 ? needsReplyThreads.length / Math.max(1, total) : 0;
  const streakBonus = Math.min(1, achievements.currentDays / 7);
  const healthParts = [
    {
      label: "Processing rate",
      score: Math.round(processingRate * 100),
      weight: 0.4,
      detail: `${handled30} of ${received30} mails handled in 30 days`,
    },
    {
      label: "Unread load",
      score: Math.round((1 - Math.min(1, unreadRatio * 3)) * 100),
      weight: 0.25,
      detail: `${unread} unread of ${total}`,
    },
    {
      label: "Reply debt",
      score: Math.round((1 - Math.min(1, debtRatio * 8)) * 100),
      weight: 0.25,
      detail: `${needsReplyThreads.length} threads need you`,
    },
    {
      label: "Clear streak",
      score: Math.round(streakBonus * 100),
      weight: 0.1,
      detail: `${achievements.currentDays} day streak`,
    },
  ];
  const healthScore = Math.round(healthParts.reduce((a, p) => a + p.score * p.weight, 0));

  // Auto-insights: the patterns a person cannot see in a flat list.
  const insights: Insights["insights"] = [];
  const dowTotals = heatmap.map((d) => d.reduce((a, b) => a + b, 0));
  const busiestDow = dowTotals.indexOf(Math.max(...dowTotals));
  const quietestDow = dowTotals.indexOf(Math.min(...dowTotals));
  if (recent.length > 20) {
    insights.push({
      tone: "info",
      text: `${DAY_NAMES[busiestDow]} is your heaviest mail day (${dowTotals[busiestDow]} mails in 90 days); ${DAY_NAMES[quietestDow]} is lightest.`,
    });
  }
  const hourTotals = heatmap.flat().map((_, h) => heatmap.reduce((a, d) => a + d[h], 0));
  const peakHour = hourTotals.indexOf(Math.max(...hourTotals));
  insights.push({
    tone: "info",
    text: `Peak inflow is around ${peakHour}:00 - schedule a processing block just after it.`,
  });
  if (topSenders.length && topSenders[0].pct >= 10) {
    insights.push({
      tone: "warn",
      text: `${topSenders[0].name} alone sends ${topSenders[0].pct}% of all your mail - consider a rule or digest for it.`,
      cta: { label: "View their mail", href: `/?q=${encodeURIComponent(topSenders[0].address)}` },
    });
  }
  const bulkPct = categories
    .filter((c) => ["Newsletters", "Marketing", "Promotions", "Cold pitches"].includes(c.label))
    .reduce((a, c) => a + c.pct, 0);
  if (bulkPct >= 30) {
    insights.push({
      tone: "warn",
      text: `${bulkPct}% of your inbox is bulk mail (newsletters/marketing/pitches) - unsubscribe runs would pay off.`,
      cta: { label: "Open bulk mail", href: "/?view=newsletters" },
    });
  }
  if (replyDebtOldestDays >= 7) {
    insights.push({
      tone: "alert",
      text: `Your oldest unanswered thread is ${replyDebtOldestDays} days old - it is probably forgotten, not pending.`,
      cta: { label: "Clear the debt", href: "/?view=needs-reply" },
    });
  } else if (needsReplyThreads.length > 0) {
    insights.push({
      tone: "info",
      text: `${needsReplyThreads.length} thread${needsReplyThreads.length === 1 ? "" : "s"} waiting on your reply, oldest ${replyDebtOldestDays} day${replyDebtOldestDays === 1 ? "" : "s"}.`,
      cta: { label: "Reply now", href: "/?view=needs-reply" },
    });
  }
  if (unread >= 25) {
    insights.push({
      tone: "warn",
      text: `${unread} unread messages are competing for attention - a focused sweep beats grazing.`,
      cta: { label: "Sweep unread", href: "/?view=inbox&q=is:unread" },
    });
  }
  if (achievements.currentDays >= 3) {
    insights.push({
      tone: "good",
      text: `${achievements.currentDays}-day clear streak - the habit is holding.`,
    });
  }
  if (processingRate >= 0.8 && received30 > 10) {
    insights.push({
      tone: "good",
      text: `You processed ${Math.round(processingRate * 100)}% of inbound mail this month.`,
    });
  }

  return {
    healthScore,
    healthParts,
    weekly,
    heatmap,
    categories,
    topSenders,
    topRecipients,
    flow: { received: received30, handled: handled30, sent: sent30, periodDays: 30 },
    replyDebt,
    replyDebtOldestDays,
    insights,
    totals: {
      total,
      unread,
      needsReply: needsReplyThreads.length,
      awaiting: awaitingThreads.length,
      snoozed,
      clearStreak: achievements.currentDays,
    },
  };
}
