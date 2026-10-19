import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getAccounts,
  getDigestSenders,
  getFollowUpThreads,
  getMessagesForFolder,
  getMessagesForLabel,
  getMessagesForView,
  getReplyQueue,
  getSidebarData,
  parseView,
  searchMessagesSemantic,
  splitInboxGroups,
} from "@/lib/queries";
import { AiSetupBanner } from "@/components/ai-setup-banner";
import { AskPanel } from "@/components/mail/ask-panel";
import { DigestList } from "@/components/mail/digest-list";
import { DigestPanel } from "@/components/mail/digest-panel";
import { IconRail } from "@/components/mail/icon-rail";
import { ReplyQueuePanel } from "@/components/mail/reply-queue-panel";
import { ResizableListPane } from "@/components/mail/resizable-list-pane";
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
import { prisma } from "@/lib/db";

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
      activeFolder={str(params, "folder")}
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

  if (view === "digest") {
    return <DigestList senders={await getDigestSenders()} />;
  }

  // Per-account filter: ?account=<id> scopes every list source. Only honored
  // when it matches a real account — a stale/foreign id falls back to "All".
  const accounts = await getAccounts();
  const accountParam = str(params, "account");
  const accountId = accounts.some((a) => a.id === accountParam) ? accountParam : undefined;
  const accountHref = (id?: string) => {
    const p = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === "string")) as Record<
        string,
        string
      >,
    );
    if (id) p.set("account", id);
    else p.delete("account");
    return `/?${p.toString()}`;
  };

  const semantic = str(params, "sm") === "1";
  let semanticNote: string | undefined;
  let items: MailItem[];
  if (label) {
    items = (await getMessagesForLabel(label, 100, accountId)).map(serializeMessage);
  } else if (folder) {
    items = (await getMessagesForFolder(folder, 100, accountId)).map(serializeMessage);
  } else if (view === "needs-reply" || view === "awaiting" || view === "reply-queue") {
    const threads = await getFollowUpThreads(
      view === "awaiting" ? "awaiting" : "needs-reply",
      accountId,
    );
    items = threads.map((t) => serializeMessage(t.latest));
  } else if (semantic && q) {
    const result = await searchMessagesSemantic(q);
    const accountEmail = accountId
      ? accounts.find((a) => a.id === accountId)?.emailAddress
      : undefined;
    items = accountEmail ? result.hits.filter((h) => h.accountEmail === accountEmail) : result.hits;
    if (!result.ok) semanticNote = result.reason ?? "semantic search unavailable";
    else if (result.hits.length === 0)
      semanticNote = "No semantic matches — run the worker once to embed your mail";
  } else {
    items = (await getMessagesForView(view, q, 100, accountId)).map(serializeMessage);
  }

  // Superhuman-style split inbox: only on the plain inbox view, not
  // searches/labels/folders where grouping would hide ordering.
  const sections =
    view === "inbox" && !q && !label && !folder ? splitInboxGroups(items) : undefined;

  return (
    <>
      {accounts.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <Link
            href={accountHref()}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              !accountId
                ? "bg-indigo-600 text-white"
                : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            All
          </Link>
          {accounts.map((a) => (
            <Link
              key={a.id}
              href={accountHref(a.id)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                accountId === a.id
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {a.displayName ?? a.emailAddress}
            </Link>
          ))}
        </div>
      )}
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
  const baseParams = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === "string")) as Record<
      string,
      string
    >,
  );

  // Mobile-only "back to list" affordance: the thread renders as a full-screen
  // overlay on small screens, so it needs its own way out.
  const backParams = new URLSearchParams(baseParams);
  backParams.delete("thread");
  backParams.delete("ask");
  backParams.delete("selected");
  const mobileBack = (
    <a
      href={`/?${backParams.toString()}`}
      className="flex items-center gap-1 border-b border-zinc-200 px-4 py-2.5 text-sm font-medium text-indigo-600 md:hidden dark:border-zinc-800 dark:text-indigo-400"
    >
      ‹ Back to list
    </a>
  );

  const askParam = params["ask"];
  if (typeof askParam === "string") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {mobileBack}
        <AskPanel question={askParam || undefined} />
      </div>
    );
  }
  if (str(params, "view") === "digest") {
    return <DigestPanel generated={str(params, "digestgen") === "1"} />;
  }
  if (str(params, "view") === "reply-queue") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {mobileBack}
        <ReplyQueuePanel />
      </div>
    );
  }
  const thread = str(params, "thread");
  if (!thread) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-300 dark:text-zinc-700">
        <p className="hidden text-sm text-zinc-400 md:block">
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
    <div className="flex min-h-0 flex-1 flex-col">
      {mobileBack}
      <ThreadPanel threadId={thread} baseParams={baseParams.toString()} />
    </div>
  );
}

async function ComposerSection({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  if (!str(params, "compose")) return null;
  const accounts = await getAccounts();
  // Reopening a saved draft restores its stored attachment chips.
  const draftId = str(params, "draftId");
  const draftAttachments = draftId
    ? (
        await prisma.attachment.findMany({
          where: { messageId: draftId },
          select: { id: true, filename: true, sizeBytes: true },
        })
      ).map((a) => ({ ...a, sizeBytes: a.sizeBytes ?? null }))
    : [];
  return (
    <Composer
      accounts={accounts.map((a) => ({
        id: a.id,
        emailAddress: a.emailAddress,
        provider: a.provider,
      }))}
      draftAttachments={draftAttachments}
    />
  );
}

/** Server wrapper: the demo-account command only exists while the user has
 *  no real provider connected — it's for first-run education, not an
 *  everyday action. */
async function CommandPaletteSection() {
  await connection();
  const accounts = await getAccounts();
  return <CommandPalette showDemo={!accounts.some((a) => a.provider !== "MOCK")} />;
}

/** Everything dynamic about the main shell — the first-run redirect and the
 *  mobile pane visibility — lives inside one Suspense boundary so the outer
 *  page stays prerenderable. */
async function MailPanes({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;

  // First run: show the welcome/brand screen before the app shell.
  if ((await getAccounts()).length === 0) redirect("/welcome");

  const paneOpen = Boolean(str(params, "thread") ?? str(params, "ask"));
  const pendingReplies = (await getReplyQueue()).length;

  return (
    <div className="relative flex flex-1 overflow-hidden">
      {/* Icon rail + collapsible folder sidebar (desktop collapse +
          mobile drawer handled inside IconRail). */}
      <IconRail pending={pendingReplies}>
        <Suspense
          fallback={
            <aside className="h-full w-full shrink-0 animate-pulse border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950" />
          }
        >
          <SidebarSection searchParams={searchParams} />
        </Suspense>
      </IconRail>
      <ResizableListPane paneOpen={paneOpen}>
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
          <ListSection searchParams={searchParams} />
        </Suspense>
      </ResizableListPane>
      <section
        className={`${paneOpen ? "flex" : "hidden md:flex"} fixed inset-0 z-30 min-h-0 min-w-0 flex-1 flex-col bg-white md:static md:z-auto md:bg-zinc-50/40 dark:bg-zinc-950 md:dark:bg-black/20`}
      >
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
          <PaneSection searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  );
}

export default function Home(props: PageProps<"/">) {
  return (
    // h-dvh pins the app shell to the viewport so each pane scrolls
    // internally (Gmail-style) instead of the whole page scrolling.
    <div className="flex h-dvh flex-col overflow-hidden bg-white dark:bg-zinc-950">
      <Suspense
        fallback={<header className="h-[46px] border-b border-zinc-200 dark:border-zinc-800" />}
      >
        <Topbar />
      </Suspense>
      <Suspense fallback={null}>
        <NoticeBanner searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <AiSetupBanner />
      </Suspense>
      <Suspense fallback={<div className="flex-1 animate-pulse bg-zinc-50 dark:bg-zinc-900/40" />}>
        <MailPanes searchParams={props.searchParams} />
      </Suspense>

      <Suspense fallback={null}>
        <ComposerSection searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <CommandPaletteSection />
      </Suspense>
      <Suspense fallback={null}>
        <KeyboardShortcuts />
      </Suspense>
    </div>
  );
}
