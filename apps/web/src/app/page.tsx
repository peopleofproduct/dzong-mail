import { Suspense } from "react";
import { connection } from "next/server";
import {
  getAccounts,
  getFollowUpThreads,
  getMessagesForFolder,
  getMessagesForLabel,
  getMessagesForView,
  getSidebarData,
  parseView,
} from "@/lib/queries";
import { serializeMessage } from "@/components/mail/types";
import type { MailItem } from "@/components/mail/types";
import { CommandPalette } from "@/components/mail/command-palette";
import { Composer } from "@/components/mail/composer";
import { MessageList } from "@/components/mail/message-list";
import { NoticeBanner } from "@/components/notice-banner";
import { Sidebar } from "@/components/mail/sidebar";
import { ThreadPanel } from "@/components/mail/thread-panel";
import { Topbar } from "@/components/mail/topbar";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const str = (params: Record<string, string | string[] | undefined>, k: string) =>
  typeof params[k] === "string" ? (params[k] as string) : undefined;

async function SidebarSection({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const data = await getSidebarData();
  return (
    <Sidebar
      data={data}
      activeView={parseView(str(params, "view"))}
      activeLabel={str(params, "label")}
      query={str(params, "q")}
    />
  );
}

async function ListSection({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const view = parseView(str(params, "view"));
  const label = str(params, "label");
  const folder = str(params, "folder");
  const q = str(params, "q");

  let items: MailItem[];
  if (label) {
    items = (await getMessagesForLabel(label)).map(serializeMessage);
  } else if (folder) {
    items = (await getMessagesForFolder(folder)).map(serializeMessage);
  } else if (view === "needs-reply" || view === "awaiting") {
    const threads = await getFollowUpThreads(view);
    items = threads.map((t) => serializeMessage(t.latest));
  } else {
    items = (await getMessagesForView(view, q)).map(serializeMessage);
  }

  return (
    <MessageList
      messages={items}
      selectedId={str(params, "selected")}
      threadId={str(params, "thread")}
    />
  );
}

async function PaneSection({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const thread = str(params, "thread");
  if (!thread) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-300 dark:text-zinc-700">
        <p className="text-sm text-zinc-400">
          Select a message — or press{" "}
          <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">j</kbd>/
          <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">k</kbd> to
          move,{" "}
          <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">⌘K</kbd> for
          commands
        </p>
      </div>
    );
  }
  return (
    <ThreadPanel
      threadId={thread}
      baseParams={new URLSearchParams(
        Object.fromEntries(
          Object.entries(params).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>,
      ).toString()}
    />
  );
}

async function ComposerSection({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  if (!str(params, "compose")) return null;
  const accounts = await getAccounts();
  return (
    <Composer
      accounts={accounts.map((a) => ({
        id: a.id,
        emailAddress: a.emailAddress,
        provider: a.provider,
      }))}
    />
  );
}

export default function Home(props: PageProps<"/">) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
      <Suspense
        fallback={<header className="h-[46px] border-b border-zinc-200 dark:border-zinc-800" />}
      >
        <Topbar />
      </Suspense>
      <Suspense fallback={null}>
        <NoticeBanner searchParams={props.searchParams} />
      </Suspense>
      <div className="flex flex-1 overflow-hidden">
        <Suspense
          fallback={
            <aside className="w-56 shrink-0 animate-pulse border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950" />
          }
        >
          <SidebarSection searchParams={props.searchParams} />
        </Suspense>
        <section className="flex w-[380px] shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
          <Suspense
            fallback={
              <div className="flex-1 space-y-2 p-3">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900"
                  />
                ))}
              </div>
            }
          >
            <ListSection searchParams={props.searchParams} />
          </Suspense>
        </section>
        <section className="flex min-w-0 flex-1 flex-col bg-zinc-50/40 dark:bg-black/20">
          <Suspense
            fallback={
              <div className="flex-1 space-y-3 p-5">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-32 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900"
                  />
                ))}
              </div>
            }
          >
            <PaneSection searchParams={props.searchParams} />
          </Suspense>
        </section>
      </div>

      <Suspense fallback={null}>
        <ComposerSection searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
    </div>
  );
}
