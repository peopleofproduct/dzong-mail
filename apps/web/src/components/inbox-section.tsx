import { getRecentMessages } from "@/lib/queries";
import { toggleMessageFlag } from "@/lib/actions";

export async function InboxSection() {
  const messages = await getRecentMessages();

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        Inbox
      </h2>

      {messages.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nothing synced yet. Hit “Sync now” on an account above.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {messages.map((msg) => (
            <li key={msg.id} className="flex items-start gap-3 px-4 py-3">
              <form action={toggleMessageFlag.bind(null, msg.id, "isStarred")}>
                <button
                  type="submit"
                  aria-label={msg.isStarred ? "Unstar" : "Star"}
                  className={`mt-0.5 text-base leading-none ${
                    msg.isStarred
                      ? "text-amber-500"
                      : "text-zinc-300 hover:text-amber-400 dark:text-zinc-600"
                  }`}
                >
                  ★
                </button>
              </form>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`truncate text-sm ${
                      msg.isRead
                        ? "text-zinc-600 dark:text-zinc-400"
                        : "font-semibold text-black dark:text-zinc-100"
                    }`}
                  >
                    {msg.fromName ?? msg.fromAddress}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-zinc-400">
                    {msg.receivedAt.toLocaleString()}
                  </span>
                </div>
                <p
                  className={`truncate text-sm ${
                    msg.isRead
                      ? "text-zinc-500 dark:text-zinc-400"
                      : "font-medium text-zinc-800 dark:text-zinc-200"
                  }`}
                >
                  {msg.subject ?? "(no subject)"}
                </p>
                {msg.snippet ? (
                  <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">{msg.snippet}</p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-1">
                  {msg.providerLabels.map((label) => (
                    <span
                      key={label}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {label}
                    </span>
                  ))}
                  {msg.aiLabels.map((label) => (
                    <span
                      key={label}
                      className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <form action={toggleMessageFlag.bind(null, msg.id, "isRead")}>
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-[10px] font-medium text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  {msg.isRead ? "Mark unread" : "Mark read"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
