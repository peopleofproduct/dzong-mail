import { connection } from "next/server";
import { getSubscriptions } from "@/lib/queries";
import { unsubscribeSenderNow } from "@/lib/actions";

export async function SubscriptionsSection() {
  await connection();
  const subs = await getSubscriptions();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        Subscriptions
      </h2>
      <p className="text-xs text-zinc-400">
        Bulk senders detected via List-Unsubscribe headers and AI/promotion labels. Unsubscribing
        uses the sender&apos;s own mechanism and archives their mail.
      </p>

      {subs.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No subscription mail detected yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {subs.map((s) => (
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
                {s.count} msg{s.count === 1 ? "" : "s"}
                {s.unread > 0 && ` · ${s.unread} unread`}
              </span>
              {s.unsubscribed ? (
                <span className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  unsubscribed
                </span>
              ) : s.canUnsubscribe ? (
                <form action={unsubscribeSenderNow.bind(null, s.fromAddress)}>
                  <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                    Unsubscribe &amp; archive
                  </button>
                </form>
              ) : (
                <span className="text-[10px] text-zinc-400">no opt-out link</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
