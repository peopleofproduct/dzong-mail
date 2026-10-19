import { Suspense } from "react";
import { AccountsSection } from "@/components/accounts-section";
import { InboxSection } from "@/components/inbox-section";
import { NoticeBanner } from "@/components/notice-banner";

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        {label}
      </h2>
      <div className="h-24 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}

export default function Home(props: PageProps<"/">) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-5xl items-baseline gap-3 px-6 py-5">
          <h1 className="text-xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Unwalled Mail
          </h1>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            local-first · your data stays here
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-8">
        <Suspense fallback={null}>
          <NoticeBanner searchParams={props.searchParams} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton label="Accounts" />}>
          <AccountsSection />
        </Suspense>
        <Suspense fallback={<SectionSkeleton label="Inbox" />}>
          <InboxSection />
        </Suspense>
      </main>
    </div>
  );
}
