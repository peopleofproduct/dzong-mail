import { Suspense } from "react";
import { connection } from "next/server";
import { Mail } from "lucide-react";
import { connectMockAccount } from "@/lib/actions";
import {
  getAccounts,
  getDigestSenders,
  getFollowUpThreads,
  getMessagesForFolder,
  getMessagesForLabel,
  getMessagesForView,
  getSidebarData,
  parseView,
  searchMessagesSemantic,
  splitInboxGroups,
} from "@/lib/queries";
import { AskPanel } from "@/components/mail/ask-panel";
import { AutoSync } from "@/components/mail/auto-sync";
import { DigestList } from "@/components/mail/digest-list";
import { DigestPanel } from "@/components/mail/digest-panel";
import { serializeMessage } from "@/components/mail/types";
import type { MailItem } from "@/components/mail/types";
import { CommandPalette } from "@/components/mail/command-palette";
import { Composer } from "@/components/mail/composer";
import { KeyboardShortcuts } from "@/components/mail/keyboard-shortcuts";
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

  // First-run experience: no accounts at all → onboarding card, not an
  // empty list that looks like a bug.
  const accounts = await getAccounts();
  if (accounts.length === 0 && !q && !label && !folder) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <Mail size={32} className="text-indigo-400" />
        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Welcome to Unwalled Mail
          </p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-400">
            Connect a Gmail, Outlook, or any IMAP account — or explore with the demo inbox.
            Everything stays on this machine.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/settings"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Connect an account
          </a>
          <form action={connectMockAccount}>
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Load demo inbox
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === "digest") {
    return <DigestList senders={await getDigestSenders()} />;
  }

  const semantic = str(params, "sm") === "1";
  let semanticNote: string | undefined;
  let items: MailItem[];
  if (label) {
    items = (await getMessagesForLabel(label)).map(serializeMessage);
  } else if (folder) {
    items = (await getMessagesForFolder(folder)).map(serializeMessage);
  } else if (view === "needs-reply" || view === "awaiting") {
    const threads = await getFollowUpThreads(view);
    items = threads.map((t) => serializeMessage(t.latest));
  } else if (semantic && q) {
    const result = await searchMessagesSemantic(q);
    items = result.hits;
    if (!result.ok) semanticNote = result.reason ?? "semantic search unavailable";
    else if (result.hits.length === 0)
      semanticNote = "No semantic matches — run the worker once to embed your mail";
  } else {
    items = (await getMessagesForView(view, q)).map(serializeMessage);
  }

  // Superhuman-style split inbox: only on the plain inbox view, not
  // searches/labels/folders where grouping would hide ordering.
  const sections =
    view === "inbox" && !q && !label && !folder ? splitInboxGroups(items) : undefined;

  return (
    <>
      {semanticNote && (
        <p className="border-b border-zinc-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:border-zinc-800 dark:bg-amber-950/40 dark:text-amber-300">
          {semanticNote}
        </p>
      )}
      <MessageList
        messages={items}
        selectedId={str(params, "selected")}
        threadId={str(params, "thread")}
        sections={sections}
      />
    </>
  );
}

async function PaneSection({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const askParam = params["ask"];
  if (typeof askParam === "string") {
    return <AskPanel question={askParam || undefined} />;
  }
  if (str(params, "view") === "digest") {
    return <DigestPanel generated={str(params, "digestgen") === "1"} />;
  }
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
      <Suspense fallback={null}>
        <KeyboardShortcuts />
      </Suspense>
      <Suspense fallback={null}>
        <AutoSync />
      </Suspense>
    </div>
  );
}
