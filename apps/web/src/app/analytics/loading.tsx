/** Skeleton mirroring the analytics layout — paints instantly while the
 *  page's data sections stream in. */
export default function AnalyticsLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse px-4 py-6 sm:px-6">
      <div className="h-4 w-28 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-2 h-7 w-56 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-2 h-3.5 w-72 rounded bg-zinc-100 dark:bg-zinc-800/60" />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/70 dark:bg-zinc-900/60 dark:ring-zinc-800"
          />
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="h-56 rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/70 dark:bg-zinc-900/60 dark:ring-zinc-800" />
        <div className="h-56 rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/70 dark:bg-zinc-900/60 dark:ring-zinc-800" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-48 rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/70 dark:bg-zinc-900/60 dark:ring-zinc-800"
          />
        ))}
      </div>
    </div>
  );
}
