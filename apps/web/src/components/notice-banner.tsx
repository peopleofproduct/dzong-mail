interface NoticeBannerProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function NoticeBanner({ searchParams }: NoticeBannerProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const notice = typeof params.notice === "string" ? params.notice : undefined;

  if (!error && !notice) return null;

  return (
    <div
      role="alert"
      className={`rounded-lg border px-4 py-3 text-sm ${
        error
          ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
      }`}
    >
      {error ?? notice}
    </div>
  );
}
