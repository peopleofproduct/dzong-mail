import Link from "next/link";
import { CheckCheck, ExternalLink, Pencil, Send, Sparkles, X } from "lucide-react";
import { getReplyQueue } from "@/lib/queries";
import { archiveThreadNow, draftAiReplyNow, sendDraftNow } from "@/lib/actions";
import { SenderAvatar } from "./sender-avatar";

const cardBtn =
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium";

/**
 * Reply queue — every thread waiting on you, newest first, each paired with
 * the draft already written for it. Review → send, edit, draft, or dismiss.
 * Clearing the queue is the daily "inbox fully attended" ritual.
 */
export async function ReplyQueuePanel() {
  const items = await getReplyQueue();

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
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60"
            >
              <header className="flex items-center gap-2">
                <SenderAvatar email={m.fromAddress} name={m.fromName} size={30} />
                <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {m.fromName ?? m.fromAddress}
                </span>
                <span className="truncate text-xs text-zinc-400">
                  &lt;{m.fromAddress}&gt; · {m.emailAccount.emailAddress}
                </span>
                <span className="ml-auto shrink-0 text-xs text-zinc-400">
                  {m.receivedAt.toLocaleString()}
                </span>
              </header>
              <p className="mt-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {m.subject ?? "(no subject)"}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {m.snippet}
              </p>

              {draft ? (
                <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/30">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
                    <Sparkles size={10} />
                    {draft.providerLabels.includes("AI_DRAFT") ? "AI draft ready" : "Draft ready"}
                  </p>
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
                  <form action={draftAiReplyNow.bind(null, m.id)}>
                    <button
                      type="submit"
                      className={`${cardBtn} border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40`}
                    >
                      <Sparkles size={11} /> Draft a reply with AI
                    </button>
                  </form>
                </div>
              )}

              <div className="mt-3 flex items-center gap-3 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                <Link
                  href={openHref}
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  <ExternalLink size={11} /> Open thread
                </Link>
                <form action={archiveThreadNow.bind(null, thread.threadId)} className="ml-auto">
                  <button
                    type="submit"
                    title="No reply needed — archive this thread"
                    className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    <X size={11} /> No reply needed
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
