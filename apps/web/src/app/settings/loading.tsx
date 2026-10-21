/** Settings skeleton — section cards matching the settings layout. */
export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl animate-pulse px-4 py-6 sm:px-6">
      <div className="h-7 w-32 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="mt-1.5 h-3.5 w-64 rounded bg-zinc-100 dark:bg-zinc-800/60" />
      <div className="mt-6 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl bg-zinc-100 p-5 ring-1 ring-zinc-200/70 dark:bg-zinc-900/60 dark:ring-zinc-800"
            style={{ height: `${140 + (i % 2) * 60}px` }}
          >
            <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700/60" />
            <div className="mt-2 h-3 w-72 max-w-full rounded bg-zinc-200/70 dark:bg-zinc-700/40" />
            <div className="mt-5 h-9 rounded-lg bg-zinc-200/70 dark:bg-zinc-700/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
