import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { getAnalyticsData, getAccounts } from "@/lib/queries";
import { getAchievementStats, snapshotInboxZero } from "@/lib/achievements";
import { AchievementCard } from "@/components/achievement-card";

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-zinc-400">{hint}</p>}
    </div>
  );
}

async function AnalyticsBody() {
  await connection();
  const data = await getAnalyticsData(14);
  // Visiting analytics counts as a checkpoint for the inbox-zero streak.
  await snapshotInboxZero();
  const [achievements, accounts] = await Promise.all([getAchievementStats(), getAccounts()]);
  const name =
    accounts.find((a) => a.displayName)?.displayName ??
    accounts[0]?.emailAddress.split("@")[0] ??
    "You";
  const maxDay = Math.max(1, ...data.daily.map((d) => d.count));
  const maxLabel = Math.max(1, ...data.labelCounts.map((l) => l.count));
  const maxSender = Math.max(1, ...data.topSenders.map((s) => s.count));

  return (
    <div className="flex flex-col gap-8">
      <AchievementCard stats={achievements} name={name} />
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          At a glance
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Stat label="Total messages" value={data.total} />
          <Stat label="Unread" value={data.unread} />
          <Stat label="Needs reply" value={data.needsReply} />
          <Stat label="Awaiting reply" value={data.awaiting} />
          <Stat label="Snoozed" value={data.snoozed} />
          <Stat label="AI drafts" value={data.aiDrafts} hint={`${data.drafts} total drafts`} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Volume — last 14 days
        </h2>
        <div className="flex h-32 items-end gap-1.5 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          {data.daily.map((d) => (
            <div key={d.date} className="group flex flex-1 flex-col items-center gap-1">
              <span className="text-[9px] text-zinc-400 opacity-0 transition group-hover:opacity-100">
                {d.count}
              </span>
              <div
                className="w-full rounded-t bg-indigo-500/80 dark:bg-indigo-400/70"
                style={{ height: `${Math.max(2, (d.count / maxDay) * 100)}%` }}
                title={`${d.date}: ${d.count} messages`}
              />
              <span className="text-[9px] text-zinc-400">{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-8 sm:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Top senders
          </h2>
          <ul className="flex flex-col gap-1.5">
            {data.topSenders.map((s) => (
              <li key={s.address} className="flex items-center gap-2 text-xs">
                <span className="w-40 truncate text-zinc-700 dark:text-zinc-300">
                  {s.name ?? s.address}
                </span>
                <div
                  className="h-3.5 rounded bg-zinc-300/70 dark:bg-zinc-700"
                  style={{ width: `${Math.max(4, (s.count / maxSender) * 100)}%` }}
                />
                <span className="text-zinc-400">{s.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Labels
          </h2>
          {data.labelCounts.length === 0 ? (
            <p className="text-xs text-zinc-400">No labels yet — classify mail to populate.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.labelCounts.map((l) => (
                <li key={l.label} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-40 truncate ${
                      l.ai
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {l.label}
                  </span>
                  <div
                    className={`h-3.5 rounded ${l.ai ? "bg-indigo-300/70 dark:bg-indigo-800" : "bg-emerald-300/70 dark:bg-emerald-800"}`}
                    style={{ width: `${Math.max(4, (l.count / maxLabel) * 100)}%` }}
                  />
                  <span className="text-zinc-400">{l.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
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
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            everything computed from local data
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Suspense
          fallback={<div className="h-64 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />}
        >
          <AnalyticsBody />
        </Suspense>
      </main>
    </div>
  );
}
