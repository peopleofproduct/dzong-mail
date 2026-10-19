import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, AlertTriangle, CheckCircle2, Info, Sparkles } from "lucide-react";
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
    <div className="rounded-xl border border-zinc-200/80 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900/60">
      <p className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{value}</p>
      <p className="text-[11px] text-zinc-400">{label}</p>
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
  return (
    <div className="flex flex-col gap-6">
      <AchievementCard stats={achievements} name={name} />

      {/* Insights strip - the auto-generated story of the data. */}
      <div className="grid gap-2 sm:grid-cols-2">
        {insights.insights.slice(0, 6).map((ins, i) => {
          const s = INSIGHT_STYLES[ins.tone];
          const Icon = s.icon;
          return (
            <p
              key={i}
              className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${s.cls}`}
            >
              <Icon size={14} className="mt-0.5 shrink-0" />
              {ins.text}
            </p>
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
              <li key={p.label}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">
                    {p.label}
                    <span className="ml-1.5 font-normal text-zinc-400">· {p.detail}</span>
                  </span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {p.score}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${
                      p.score >= 75 ? "bg-emerald-500" : p.score >= 45 ? "bg-indigo-500" : "bg-amber-500"
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
      <Card
        title="Weekly inflow"
        subtitle="Messages received per week, last 12 weeks"
      >
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top senders" subtitle="Who fills your mailbox">
          <SenderBars senders={insights.topSenders} />
        </Card>
        <Card title="In vs out" subtitle={`Last ${insights.flow.periodDays} days`}>
          <FlowBalance flow={insights.flow} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Reply debt"
          subtitle="Threads waiting on you, by age - old items fade from memory"
        >
          <DebtAging buckets={insights.replyDebt} />
        </Card>
        <Card title="Right now" subtitle="Live counts">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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
