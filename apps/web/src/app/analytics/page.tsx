import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Info, Sparkles } from "lucide-react";
import { getAccounts } from "@/lib/queries";
import { getAchievementStats, snapshotInboxZero } from "@/lib/achievements";
import { getInsights } from "@/lib/analytics";
import { AchievementCard } from "@/components/achievement-card";
import {
  ArrivalHeatmap,
  Card,
  CategoryDonut,
  DebtAging,
  FlowBalance,
  HealthRing,
  SenderBars,
  WeeklyBars,
} from "@/components/analytics/charts";

const INSIGHT_STYLES = {
  good: {
    icon: CheckCircle2,
    cls: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  warn: {
    icon: AlertTriangle,
    cls: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
  },
  alert: {
    icon: AlertTriangle,
    cls: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
  },
  info: {
    icon: Info,
    cls: "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300",
  },
} as const;

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="group rounded-xl bg-zinc-50 px-3.5 py-3 ring-1 ring-zinc-100 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-sm hover:ring-zinc-200 dark:bg-zinc-800/50 dark:ring-zinc-800 dark:hover:bg-zinc-800 dark:hover:ring-zinc-700">
      <p className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
        {value}
      </p>
      <p className="text-[11px] text-zinc-400 transition-colors group-hover:text-zinc-500 dark:group-hover:text-zinc-300">
        {label}
      </p>
    </div>
  );
}

async function AnalyticsBody() {
  await connection();
  // Visiting analytics counts as a checkpoint for the inbox-zero streak.
  await snapshotInboxZero();
  const [insights, accounts] = await Promise.all([getInsights(), getAccounts()]);
  const name =
    accounts.find((a) => a.displayName)?.displayName ??
    accounts[0]?.emailAddress.split("@")[0] ??
    "You";
  const achievements = await getAchievementStats();

  const t = insights.totals;
  const openedPct = t.total > 0 ? Math.round(((t.total - t.unread) / t.total) * 100) : 0;
  const hero = [
    {
      label: "Received",
      value: insights.flow.received,
      caption: `last ${insights.flow.periodDays} days`,
      dot: "bg-indigo-500",
    },
    {
      label: "Sent",
      value: insights.flow.sent,
      caption: `last ${insights.flow.periodDays} days`,
      dot: "bg-violet-500",
    },
    {
      label: "Opened",
      value: `${openedPct}%`,
      caption: `${t.total - t.unread} of ${t.total} messages`,
      dot: "bg-emerald-500",
    },
    {
      label: "Processed",
      value: insights.flow.handled,
      caption: "archived out of the inbox",
      dot: "bg-amber-500",
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      {/* Hero: the four numbers a person actually asks about. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {hero.map((s) => (
          <div
            key={s.label}
            className="group relative overflow-hidden rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-200/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-zinc-900/70 dark:ring-zinc-800"
          >
            <span
              className={`absolute inset-x-0 top-0 h-0.5 ${s.dot} opacity-70 transition-opacity group-hover:opacity-100`}
            />
            <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-zinc-400 uppercase">
              <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
              {s.label}
            </p>
            <p className="mt-1.5 text-3xl font-bold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
              {s.value}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-400">{s.caption}</p>
          </div>
        ))}
      </div>

      <AchievementCard stats={achievements} name={name} />

      {/* Insights strip - the auto-generated story of the data. */}
      <div className="grid gap-2 sm:grid-cols-2">
        {insights.insights.slice(0, 6).map((ins, i) => {
          const s = INSIGHT_STYLES[ins.tone];
          const Icon = s.icon;
          return (
            <div
              key={i}
              className={`flex items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${s.cls}`}
            >
              <p className="flex items-start gap-2">
                <Icon size={14} className="mt-0.5 shrink-0" />
                {ins.text}
              </p>
              {ins.cta && (
                <Link
                  href={ins.cta.href}
                  className="flex shrink-0 items-center gap-1 self-center font-semibold whitespace-nowrap underline-offset-2 hover:underline"
                >
                  {ins.cta.label}
                  <ArrowRight size={12} />
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Hero: health score + explainable breakdown. */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card
          title="Inbox health"
          subtitle="Composite of processing, unread, reply debt and streak"
          className="flex flex-col items-center justify-center lg:col-span-2"
        >
          <HealthRing score={insights.healthScore} />
        </Card>
        <Card title="What drives the score" className="lg:col-span-3">
          <ul className="space-y-4">
            {insights.healthParts.map((p) => (
              <li
                key={p.label}
                className="group cursor-default rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {p.label}
                    <span className="ml-1.5 font-normal text-zinc-400">· {p.detail}</span>
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${
                      p.score >= 75
                        ? "text-emerald-600 dark:text-emerald-400"
                        : p.score >= 45
                          ? "text-indigo-600 dark:text-indigo-400"
                          : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {p.score}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      p.score >= 75
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : p.score >= 45
                          ? "bg-gradient-to-r from-indigo-500 to-violet-400"
                          : "bg-gradient-to-r from-amber-500 to-orange-400"
                    }`}
                    style={{ width: `${Math.max(2, p.score)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Volume trend. */}
      <Card title="Weekly inflow" subtitle="Messages received per week, last 12 weeks">
        <WeeklyBars weekly={insights.weekly} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="When mail arrives" subtitle="Day x hour, last 90 days">
          <ArrivalHeatmap heatmap={insights.heatmap} />
        </Card>
        <Card title="What's in your inbox" subtitle="Category mix across all synced mail">
          <CategoryDonut categories={insights.categories} />
        </Card>
      </div>

      {/* The people in the mailbox — heard from vs written to. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="You hear from" subtitle="Who fills your mailbox">
          <SenderBars senders={insights.topSenders} />
        </Card>
        <Card title="You write to" subtitle="Where your replies actually go">
          {insights.topRecipients.length > 0 ? (
            <SenderBars senders={insights.topRecipients} />
          ) : (
            <p className="text-xs text-zinc-400">
              Nothing sent yet — once you send mail, your top correspondents show up here.
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title="Reply debt"
          subtitle="Threads waiting on you, by age - old items fade from memory"
        >
          <DebtAging buckets={insights.replyDebt} />
        </Card>
        <Card title="In vs out" subtitle={`Last ${insights.flow.periodDays} days`}>
          <FlowBalance flow={insights.flow} />
        </Card>
        <Card title="Right now" subtitle="Live counts">
          <div className="grid grid-cols-2 gap-2.5">
            <MiniStat label="Total messages" value={t.total} />
            <MiniStat label="Unread" value={t.unread} />
            <MiniStat label="Needs reply" value={t.needsReply} />
            <MiniStat label="Awaiting reply" value={t.awaiting} />
            <MiniStat label="Snoozed" value={t.snoozed} />
            <MiniStat label="Clear streak" value={t.clearStreak} />
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-6 py-5">
          <Link
            href="/"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Analytics
          </h1>
          <span className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
            <Sparkles size={13} className="text-indigo-400" />
            everything computed from local data
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Suspense
          fallback={<div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />}
        >
          <AnalyticsBody />
        </Suspense>
      </main>
    </div>
  );
}
