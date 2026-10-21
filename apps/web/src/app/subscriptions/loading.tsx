/** Subscriptions skeleton — stat cards over a table of sender rows. */
export default function SubscriptionsLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-pulse px-4 py-6 sm:px-6">
      <div className="h-7 w-44 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-1.5 h-3.5 w-80 max-w-full rounded bg-zinc-100 dark:bg-zinc-800/60" />

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/70 dark:bg-zinc-900/60 dark:ring-zinc-800"
          />
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-zinc-200/70 dark:ring-zinc-800">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-zinc-800/60"
          >
            <div className="h-3.5 w-3.5 rounded bg-zinc-200 dark:bg-zinc-700/60" />
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700/60" />
            <div className="ml-auto h-3 w-16 rounded bg-zinc-200/70 dark:bg-zinc-700/40" />
            <div className="h-3 w-24 rounded bg-zinc-200/70 dark:bg-zinc-700/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
