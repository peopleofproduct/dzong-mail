import type { Prisma } from "@unwalled/database";
import { prisma } from "@/lib/db";

export interface AchievementStats {
  /** Consecutive clear-inbox days ending today (or yesterday if today is not
   *  recorded yet - the day is still in progress). */
  currentDays: number;
  /** Best run of consecutive clear-inbox days ever recorded. */
  longestDays: number;
  /** Longest run expressed in whole weeks. */
  longestWeeks: number;
  /** Archived conversations (distinct threads plus untreaded messages). */
  totalDone: number;
  /** Whether the inbox is clear right now. */
  inboxClear: boolean;
}

const dayKey = (d: Date) => d.toLocaleDateString("sv-SE"); // YYYY-MM-DD, local

/** Same shape the inbox view uses: not archived, not draft, snooze elapsed. */
function inboxWhere(): Prisma.MessageWhereInput {
  return {
    isArchived: false,
    isDraft: false,
    OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }],
  };
}

/**
 * Record today as an inbox-zero day when the inbox is currently clear.
 * Called from the analytics page and after archive/move actions so the
 * snapshot lands at the moment the user finishes clearing.
 */
export async function snapshotInboxZero(): Promise<boolean> {
  const remaining = await prisma.message.count({ where: inboxWhere() });
  if (remaining > 0) return false;
  const date = dayKey(new Date());
  await prisma.inboxZeroDay.upsert({ where: { date }, create: { date }, update: {} });
  return true;
}

/** Longest + current runs over a sorted list of YYYY-MM-DD keys. */
function streaks(days: string[], today: string): { current: number; longest: number } {
  const set = new Set(days);
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of sorted) {
    // UTC midnight keeps day diffs exactly 24h across DST transitions.
    const d = new Date(`${key}T00:00:00Z`);
    run = prev && d.getTime() - prev.getTime() === 86400000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  // Current streak counts back from today; if today is not recorded yet the
  // streak is still alive from yesterday. Key math stays in UTC so the
  // cursor always lands on a calendar-day string.
  const prevKey = (k: string) =>
    new Date(new Date(`${k}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  let key = set.has(today) ? today : prevKey(today);
  let current = 0;
  while (set.has(key)) {
    current++;
    key = prevKey(key);
  }
  return { current, longest };
}

export async function getAchievementStats(): Promise<AchievementStats> {
  const [days, done] = await Promise.all([
    prisma.inboxZeroDay.findMany({ select: { date: true }, orderBy: { date: "asc" } }),
    // Conversations = distinct threads; unthreaded messages count individually.
    prisma.message.findMany({
      where: { isArchived: true, isDraft: false },
      select: { id: true, threadId: true },
    }),
  ]);
  const { current, longest } = streaks(
    days.map((d) => d.date),
    dayKey(new Date()),
  );
  const threads = new Set(done.map((m) => m.threadId ?? m.id));
  const inboxClear =
    (await prisma.message.count({ where: inboxWhere() })) === 0;
  return {
    currentDays: current,
    longestDays: longest,
    longestWeeks: Math.floor(longest / 7),
    totalDone: threads.size,
    inboxClear,
  };
}
