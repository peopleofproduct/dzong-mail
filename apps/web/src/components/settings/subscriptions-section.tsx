import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight } from "lucide-react";
import { getSubscriptions } from "@/lib/queries";

/** Settings preview — the real manager lives at /subscriptions (bulk select,
 *  read-rate ranking, keep list). This surfaces the count and the worst
 *  offenders so the feature stays discoverable. */
export async function SubscriptionsSection() {
  await connection();
  const subs = await getSubscriptions();
  const suggested = subs.filter((s) => s.suggested);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        Subscriptions
      </h2>
      <p className="text-xs text-zinc-400">
        Bulk senders detected via List-Unsubscribe headers and AI/promotion labels.
      </p>

      {subs.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No subscription mail detected yet.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {subs.slice(0, 5).map((s) => (
              <li
                key={s.fromAddress}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-black dark:text-zinc-100">
                    {s.fromName ?? s.fromAddress}
                  </p>
                  <p className="truncate text-xs text-zinc-400">{s.fromAddress}</p>
                </div>
                <span className="text-xs text-zinc-400">
                  {s.count} msg{s.count === 1 ? "" : "s"} · {s.readPct}% read
                </span>
                {s.unsubscribed && (
                  <span className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    unsubscribed
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Link
            href="/subscriptions"
            className="inline-flex items-center gap-1.5 self-start rounded-md border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          >
            Manage all {subs.length} senders
            {suggested.length > 0 && ` — ${suggested.length} suggested to cut`}
            <ArrowRight size={12} />
          </Link>
        </>
      )}
    </section>
  );
}
