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
  viewWhere,
} from "@/lib/queries";
import { AiSetupBanner } from "@/components/ai-setup-banner";
import { AskPanel } from "@/components/mail/ask-panel";
import { DigestList } from "@/components/mail/digest-list";
import { DigestPanel } from "@/components/mail/digest-panel";
import { IconRail } from "@/components/mail/icon-rail";
import { NavLink } from "@/components/mail/nav-link";
import { ReplyQueuePanel } from "@/components/mail/reply-queue-panel";
import { ResizableListPane } from "@/components/mail/resizable-list-pane";
import { serializeMessage } from "@/components/mail/types";
import type { MailItem } from "@/components/mail/types";
import { CommandPalette } from "@/components/mail/command-palette";
import { UndoSendToast } from "@/components/mail/undo-send-toast";
import { MorningBriefingCard } from "@/components/mail/morning-briefing";
import { getSplitLabels } from "@/lib/settings";
import { cleanEmailHtml, htmlToText, looksLikeHtml } from "@/lib/email-html";
import { textToHtml } from "@dzong/sync-engine";
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
  const filterParam = str(params, "filter");
  const filter =
    filterParam === "unread" || filterParam === "attachments" ? filterParam : undefined;
  // Kick off every independent fetch before awaiting — items, chip counts,
  // and split labels all resolve concurrently instead of serially.
  const showChips = !label && !folder && !q;
  const scoped = accountId ? { emailAccountId: accountId } : {};
  const chipCountsP = showChips
    ? Promise.all([
        prisma.message.count({
          where: { AND: [viewWhere("inbox"), scoped, { isRead: false }] },
        }),
        prisma.message.count({
          where: { AND: [viewWhere("inbox"), scoped, { hasAttachment: true }] },
        }),
        getReplyQueue().then((q) => q.length),
        prisma.message.count({ where: { AND: [viewWhere("newsletters"), scoped] } }),
      ])
    : undefined;
  const splitLabelsP =
    view === "inbox" && !q && !label && !folder ? getSplitLabels() : Promise.resolve([]);

  let semanticNote: string | undefined;
  let items: MailItem[];
  if (label) {
    items = (await getMessagesForLabel(label, 100, accountId)).map(serializeMessage);
  } else if (folder) {
    items = (await getMessagesForFolder(folder, 100, accountId)).map(serializeMessage);
  } else if (view === "needs-reply" || view === "awaiting" || view === "reply-queue") {
    const threads = await getFollowUpThreads(
      view === "awaiting" ? "needs-reply" : "needs-reply",
      accountId,
    );
    items = threads.map((t) => serializeMessage(t.latest));
  } else if (semantic && q) {
    const result = await searchMessagesSemantic(q);
    const accountEmail = accountId
      ? accounts.find((a) => a.id === accountId)?.emailAddress
      : undefined;
    items = accountEmail ? result.hits.filter((h) => h.accountEmail === accountEmail) : result.hits;
    if (!result.ok) semanticNote = result.reason ?? "AI search isn't available right now";
    else if (result.hits.length === 0)
      semanticNote =
        "No AI matches yet - your inbox is still being indexed (it happens during sync)";
  } else {
    items = (await getMessagesForView(view, q, 100, accountId, filter)).map(serializeMessage);
  }

  // Superhuman-style split inbox: only on the plain inbox view, not
  // searches/labels/folders where grouping would hide ordering.
  const sections =
    view === "inbox" && !q && !label && !folder
      ? splitInboxGroups(items, await splitLabelsP)
      : undefined;

  // Quick-filter chip strip: in-list filters (unread/attachments) alongside
  // nav chips to the reply queue and newsletters — the glanceable "what
  // needs me" row. Shown on every list view (not labels/folders/search) so
  // it behaves like a persistent filter rail. Counts are scoped to the
  // active account chip.
  const chipCountsArr = await chipCountsP;
  const chipCounts = chipCountsArr
    ? {
        unread: chipCountsArr[0],
        attachments: chipCountsArr[1],
        needsReply: chipCountsArr[2],
        newsletters: chipCountsArr[3],
      }
    : undefined;
  const chipHref = (overrides: Record<string, string>) => {
    const p = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => typeof v === "string")) as Record<
        string,
        string
      >,
    );
    p.set("view", "inbox");
    p.delete("filter");
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/?${p.toString()}`;
  };
  const chipCls = (active: boolean) =>
    `shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
      active
        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
    }`;

  return (
    <>
      {accounts.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <NavLink
            href={accountHref()}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              !accountId
                ? "bg-indigo-600 text-white"
                : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            All
          </NavLink>
          {accounts.map((a) => (
            <NavLink
              key={a.id}
              href={accountHref(a.id)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                accountId === a.id
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {a.displayName ?? a.emailAddress}
            </NavLink>
          ))}
        </div>
      )}
      {showChips && chipCounts && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          <NavLink href={chipHref({})} className={chipCls(view === "inbox" && !filter)}>
            All
          </NavLink>
          <NavLink
            href={chipHref({ filter: "unread" })}
            className={chipCls(view === "inbox" && filter === "unread")}
          >
            Unread
            {chipCounts.unread > 0 && (
              <span className="ml-1 text-[10px] opacity-70">{chipCounts.unread}</span>
            )}
          </NavLink>
          <NavLink
            href={chipHref({ filter: "attachments" })}
            className={chipCls(view === "inbox" && filter === "attachments")}
          >
            Attachments
            {chipCounts.attachments > 0 && (
              <span className="ml-1 text-[10px] opacity-70">{chipCounts.attachments}</span>
            )}
          </NavLink>
          <span className="mx-1 h-4 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700" />
          <NavLink
            href="/?view=needs-reply"
            className={chipCls(view === "needs-reply" || view === "reply-queue")}
          >
            Needs reply
            {chipCounts.needsReply > 0 && (
              <span className="ml-1 text-[10px] opacity-70">{chipCounts.needsReply}</span>
            )}
          </NavLink>
          <NavLink href="/?view=newsletters" className={chipCls(view === "newsletters")}>
            Newsletters
            {chipCounts.newsletters > 0 && (
              <span className="ml-1 text-[10px] opacity-70">{chipCounts.newsletters}</span>
            )}
          </NavLink>
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
  // Reopening a saved draft restores its stored attachment chips and, when
  // the draft was written with the rich editor, its formatted body.
  const draftId = str(params, "draftId");
  const fwdId = str(params, "fwd");
  const [draftAttachments, snippets, draftBody, fwdSource] = await Promise.all([
    draftId
      ? prisma.attachment.findMany({
          where: { messageId: draftId },
          select: { id: true, filename: true, sizeBytes: true },
        })
      : Promise.resolve([]),
    prisma.snippet.findMany({ orderBy: { name: "asc" } }),
    draftId
      ? prisma.message.findUnique({
          where: { id: draftId },
          select: { bodyHtml: true, bodyText: true },
        })
      : Promise.resolve(null),
    fwdId ? prisma.message.findUnique({ where: { id: fwdId } }) : Promise.resolve(null),
  ]);

  // Forward fidelity: the draft body is built from the original's structured
  // HTML, so forwarded newsletters keep their formatting instead of arriving
  // as a raw text dump.
  let initialBodyText = draftBody?.bodyText ?? undefined;
  let initialBodyHtml = draftBody?.bodyHtml ? cleanEmailHtml(draftBody.bodyHtml).html : undefined;
  if (fwdSource) {
    const headerText =
      `\n\n---------- Forwarded message ---------\n` +
      `From: ${fwdSource.fromName ?? ""} <${fwdSource.fromAddress}>\n` +
      `Date: ${fwdSource.receivedAt.toLocaleString()}\n` +
      `Subject: ${fwdSource.subject ?? ""}\n\n`;
    const sourceText = fwdSource.bodyText ?? fwdSource.snippet ?? "";
    const sourceTextIsMarkup = looksLikeHtml(sourceText);
    initialBodyText = headerText + (sourceTextIsMarkup ? htmlToText(sourceText) : sourceText);
    const sourceHtml =
      fwdSource.bodyHtml ?? (sourceTextIsMarkup ? sourceText : textToHtml(sourceText));
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const headerHtml =
      "<p>---------- Forwarded message ---------<br>" +
      `From: ${esc(fwdSource.fromName ?? "")} &lt;${esc(fwdSource.fromAddress)}&gt;<br>` +
      `Date: ${esc(fwdSource.receivedAt.toLocaleString())}<br>` +
      `Subject: ${esc(fwdSource.subject ?? "")}</p>`;
    initialBodyHtml = cleanEmailHtml(headerHtml + sourceHtml).html;
  }

  return (
    <Composer
      accounts={accounts.map((a) => ({
        id: a.id,
        emailAddress: a.emailAddress,
        provider: a.provider,
      }))}
      draftAttachments={draftAttachments.map((a) => ({ ...a, sizeBytes: a.sizeBytes ?? null }))}
      // Re-sanitize stored rich text through the display pipeline — the
      // editor restores it verbatim into a contenteditable.
      initialBodyHtml={initialBodyHtml}
      initialBodyText={initialBodyText}
      snippets={snippets}
    />
  );
}

/** Undo-send toast: reads the ?undo=<messageId> param the send action sets,
 *  renders the countdown only while the send is still queued. */
async function UndoSection({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const undo = str(params, "undo");
  if (!undo) return null;
  const msg = await prisma.message.findUnique({
    where: { id: undo },
    select: { subject: true, isDraft: true, scheduledAt: true },
  });
  if (!msg?.isDraft || !msg.scheduledAt) return null;
  return <UndoSendToast messageId={undo} subject={msg.subject ?? "(no subject)"} />;
}

/** "While you slept" briefing — aggregates the worker's AgentRun log since
 *  yesterday evening plus what is still waiting on the user. */
async function BriefingSection() {
  await connection();
  const since = new Date();
  since.setDate(since.getDate() - 1);
  since.setHours(18, 0, 0, 0);
  if (since > new Date()) since.setDate(since.getDate() - 1); // before 18:00 today? look back to day-before 18:00
  const [runs, draftsWaiting, followUpsWaiting] = await Promise.all([
    prisma.agentRun.findMany({ where: { ranAt: { gte: since } }, select: { summary: true } }),
    prisma.message.count({ where: { isDraft: true, providerLabels: { has: "AI_DRAFT" } } }),
    prisma.notification.count({ where: { kind: "follow-up", readAt: null } }),
  ]);
  const stats = {
    inserted: 0,
    classified: 0,
    rulesApplied: 0,
    sent: 0,
    unsnoozed: 0,
    followUpReminders: 0,
    draftsWaiting,
    followUpsWaiting,
  };
  for (const r of runs) {
    const s = r.summary as Record<string, number>;
    stats.inserted += s.inserted ?? 0;
    stats.classified += s.classified ?? 0;
    stats.rulesApplied += s.rulesApplied ?? 0;
    stats.sent += s.sent ?? 0;
    stats.unsnoozed += s.unsnoozed ?? 0;
    stats.followUpReminders += s.followUpReminders ?? 0;
  }
  const total = stats.inserted + stats.sent + stats.unsnoozed + stats.followUpReminders;
  if (total === 0 && draftsWaiting === 0 && followUpsWaiting === 0) return null;
  return <MorningBriefingCard stats={stats} dateKey={new Date().toLocaleDateString("sv-SE")} />;
}

/**
 * Inbox energy budgeting: turn unread + reply debt into a minutes estimate
 * and point at the highest-value subset. Estimates are honest heuristics -
 * ~40s to triage an unread message, ~3 min to write a real reply.
 */
async function EnergySection() {
  await connection();
  const [unread, needsReply] = await Promise.all([
    prisma.message.count({
      where: {
        isRead: false,
        isDraft: false,
        isArchived: false,
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: new Date() } }],
      },
    }),
    prisma.message.count({ where: { isDraft: false, aiLabels: { has: "NEEDS_REPLY" } } }),
  ]);
  if (unread + needsReply === 0) return null;
  const triageMin = Math.ceil(unread * 0.7);
  const replyMin = needsReply * 3;
  const total = triageMin + replyMin;
  // The "subset that matters": the reply debt only - triage the rest later.
  const subset = replyMin + Math.ceil(unread * 0.15);
  return (
    <div className="flex items-center gap-2 border-b border-zinc-200/80 bg-gradient-to-r from-white via-zinc-50/60 to-white px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-900/50 dark:to-zinc-950 dark:text-zinc-400">
      <span>
        Inbox work today:{" "}
        <span className="font-semibold text-zinc-800 dark:text-zinc-200">~{total} min</span>
        <span className="text-zinc-400">
          {" "}
          · {unread} unread · {needsReply} waiting replies
        </span>
      </span>
      <Link
        href="/?view=needs-reply"
        className="ml-auto shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
      >
        Do the ~{subset}-min subset that matters →
      </Link>
    </div>
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
        className={`${paneOpen ? "flex" : "hidden md:flex"} anim-pane fixed inset-0 z-30 min-h-0 min-w-0 flex-1 flex-col bg-white md:static md:z-auto md:bg-zinc-50/40 dark:bg-zinc-950 md:dark:bg-black/20`}
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
      <Suspense fallback={null}>
        <BriefingSection />
      </Suspense>
      <Suspense fallback={null}>
        <EnergySection />
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
        <UndoSection searchParams={props.searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <KeyboardShortcuts />
      </Suspense>
    </div>
  );
}
