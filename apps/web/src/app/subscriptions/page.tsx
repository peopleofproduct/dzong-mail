import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft, MailX } from "lucide-react";
import { getSubscriptions } from "@/lib/queries";
import { SubscriptionsManager } from "@/components/subscriptions/subscriptions-manager";

async function SubscriptionsBody() {
  await connection();
  const subs = await getSubscriptions();
  const suggested = subs.filter((s) => s.suggested).length;
  const totalMsgs = subs.reduce((a, s) => a + s.count, 0);
  const readPct =
    totalMsgs > 0
      ? Math.round((subs.reduce((a, s) => a + (s.count - s.unread), 0) / totalMsgs) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Noise summary — the honest number that motivates the sweep. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Bulk senders", value: subs.length },
          { label: "Their messages", value: totalMsgs },
          { label: "You actually read", value: `${readPct}%` },
          { label: "Suggested cuts", value: suggested, accent: suggested > 0 },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-zinc-200/80 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <p
              className={`text-xl font-bold tracking-tight ${
                s.accent ? "text-amber-600 dark:text-amber-400" : "text-zinc-900 dark:text-zinc-50"
              }`}
            >
              {s.value}
            </p>
            <p className="text-[11px] text-zinc-400">{s.label}</p>
          </div>
        ))}
      </div>

      <SubscriptionsManager subs={subs} />
    </div>
  );
}

export default function SubscriptionsPage() {
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
            Subscriptions
          </h1>
          <span className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
            <MailX size={13} className="text-indigo-400" />
            every bulk sender, ranked by how little you read them
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <Suspense
          fallback={<div className="h-64 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />}
        >
          <SubscriptionsBody />
        </Suspense>
      </main>
    </div>
  );
}
