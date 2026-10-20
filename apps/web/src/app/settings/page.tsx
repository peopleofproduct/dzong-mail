import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AccountsSection } from "@/components/accounts-section";
import { AISettingsSection } from "@/components/settings/ai-settings-section";
import { NoticeBanner } from "@/components/notice-banner";
import { RulesSection } from "@/components/settings/rules-section";
import { RoutinesSection } from "@/components/settings/routines-section";
import { SubscriptionsSection } from "@/components/settings/subscriptions-section";
import { WorkspaceSection } from "@/components/settings/workspace-section";

function SectionSkeleton() {
  return <div className="h-32 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />;
}

export default async function SettingsPage(props: PageProps<"/settings">) {
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
            Settings
          </h1>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            accounts · automation · AI engine
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-8">
        <Suspense fallback={null}>
          <NoticeBanner searchParams={props.searchParams} />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <AccountsSection />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <WorkspaceSection />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <RulesSection />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <RoutinesSection />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <SubscriptionsSection />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <AISettingsSection />
        </Suspense>
      </main>
    </div>
  );
}
