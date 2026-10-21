import Link from "next/link";
import { BellOff, CheckCheck, Clock, ExternalLink, Pencil, Send, Sparkles } from "lucide-react";
import { getRecipientStyle } from "@dzong/sync-engine";
import { getReplyQueue } from "@/lib/queries";
import { getNoReplyDismissals } from "@/lib/settings";
import { sendDraftLater, sendDraftNow, snoozeMessage } from "@/lib/actions";
import { AiDraftButton } from "./ai-draft-button";
import { NoReplyButton } from "./no-reply-button";
import { SenderAvatar } from "./sender-avatar";
import { VoiceBadge } from "./voice-badge";

const cardBtn =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97]";

/**
 * Reply queue — every thread waiting on you, newest first, each paired with
 * the draft already written for it. Review → send, edit, draft, or dismiss.
 * Clearing the queue is the daily "inbox fully attended" ritual.
 */
export async function ReplyQueuePanel() {
  const [items, dismissals] = await Promise.all([getReplyQueue(), getNoReplyDismissals()]);

  // Voice profiles for the threads that already have a draft — the badge
  // explains *why* the AI draft sounds like the user. Bounded to ≤25 pairs
  // of small queries; skipped entirely when no drafts exist.
  const styleEntries = await Promise.all(
    items
      .filter((i) => i.draft)
      .map(
        async ({ thread }) =>
          [
            thread.latest.fromAddress.toLowerCase(),
            await getRecipientStyle(thread.latest.fromAddress, thread.latest.emailAccountId),
          ] as const,
      ),
  );
  const styleBySender = new Map(styleEntries);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Reply queue</h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          {items.length === 0
            ? "Inbox zero — nothing is waiting on you."
            : `${items.length} thread${items.length === 1 ? "" : "s"} waiting on your reply · drafts ready where AI could write one`}
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {items.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-300 dark:text-zinc-700">
            <CheckCheck size={40} />
            <p className="text-sm text-zinc-400">All attended. Nothing pending.</p>
          </div>
        )}

        {items.map(({ thread, draft }) => {
          const m = thread.latest;
          const openHref = `/?view=reply-queue&thread=${thread.threadId}`;
          return (
            <article
              key={thread.threadId}
              className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200/80 transition-shadow hover:shadow-lg hover:shadow-zinc-200/50 dark:bg-zinc-900/70 dark:ring-zinc-800 dark:hover:shadow-black/40"
            >
              <header className="flex items-center gap-2.5">
                <SenderAvatar email={m.fromAddress} name={m.fromName} size={34} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {m.fromName ?? m.fromAddress}
                  </p>
                  <p className="truncate text-[11px] text-zinc-400">
                    &lt;{m.fromAddress}&gt; · {m.emailAccount.emailAddress}
                  </p>
                </div>
                <span className="ml-auto shrink-0 self-start rounded-full bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-400 tabular-nums ring-1 ring-zinc-100 dark:bg-zinc-800/60 dark:ring-zinc-800">
                  {m.receivedAt.toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </header>
              <p className="mt-2.5 truncate text-[15px] font-medium tracking-tight text-zinc-800 dark:text-zinc-100">
                {m.subject ?? "(no subject)"}
              </p>
              <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                {m.snippet}
              </p>

              {draft ? (
                <div className="mt-4 rounded-xl bg-gradient-to-br from-indigo-50/80 to-violet-50/50 p-4 ring-1 ring-indigo-100/80 dark:from-indigo-950/40 dark:to-violet-950/20 dark:ring-indigo-900/40">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-indigo-500 uppercase dark:text-indigo-400">
                    <Sparkles size={10} />
                    {draft.providerLabels.includes("AI_DRAFT") ? "AI draft ready" : "Draft ready"}
                  </p>
                  <VoiceBadge style={styleBySender.get(m.fromAddress.toLowerCase()) ?? null} />
                  <p className="mt-1.5 line-clamp-4 text-sm leading-relaxed whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                    {draft.bodyText ?? draft.snippet}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form action={sendDraftNow.bind(null, draft.id)}>
                      <button
                        type="submit"
                        className={`${cardBtn} border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-500`}
                      >
                        <Send size={11} /> Send
                      </button>
                    </form>
                    <form action={sendDraftLater.bind(null, draft.id)}>
                      <button
                        type="submit"
                        title="Send tomorrow at 9am"
                        className={`${cardBtn} border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800`}
                      >
                        <Clock size={11} /> Send later
                      </button>
                    </form>
                    <Link
                      href={openHref}
                      className={`${cardBtn} border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800`}
                    >
                      <Pencil size={11} /> Review / edit
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <AiDraftButton
                    messageId={m.id}
                    className={`${cardBtn} border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40`}
                  />
                </div>
              )}

              <div className="mt-4 flex items-center gap-3.5 border-t border-zinc-100 pt-3 dark:border-zinc-800/80">
                <Link
                  href={openHref}
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  <ExternalLink size={11} /> Open thread
                </Link>
                <form action={snoozeMessage.bind(null, m.id, 24)}>
                  <button
                    type="submit"
                    title="Remind me tomorrow — snooze this thread 24h"
                    className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    <BellOff size={11} /> Remind me
                  </button>
                </form>
                <span className="ml-auto">
                  <NoReplyButton
                    threadId={thread.threadId}
                    senderAddress={m.fromAddress}
                    dismissals={dismissals[m.fromAddress.toLowerCase()] ?? 0}
                  />
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
