import Link from "next/link";
import { Archive, ArrowRight, CheckCheck, Sparkles } from "lucide-react";
import { askInbox } from "@unwalled/sync-engine";
import type { SemanticHit } from "@unwalled/sync-engine";
import { getLocalUser } from "@/lib/queries";
import { archiveMessages, markMessagesRead } from "@/lib/actions";

/** Actionable next steps computed from what the answer was grounded on. */
function recommendations(hits: SemanticHit[]) {
  const recs: { label: string; href: string }[] = [];
  const bySender = new Map<string, number>();
  for (const h of hits) {
    bySender.set(h.message.fromAddress, (bySender.get(h.message.fromAddress) ?? 0) + 1);
  }
  const top = [...bySender.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) {
    recs.push({
      label: `Create a rule for ${top[0]}`,
      href: "/settings",
    });
  }
  if (hits.some((h) => h.message.aiLabels.includes("NEEDS_REPLY"))) {
    recs.push({ label: "Open the reply queue", href: "/?view=reply-queue" });
  }
  if (
    hits.some((h) =>
      h.message.aiLabels.some((l) => ["NEWSLETTER", "MARKETING", "COLD_PITCH"].includes(l)),
    )
  ) {
    recs.push({ label: "Clean up the bulk mail behind this", href: "/?view=digest" });
  }
  return recs;
}

/**
 * The assistant pane. Accepts any natural-language question, grounds the
 * answer in the local store, cites the messages it used, and offers the
 * next actions that make sense for what it found.
 */
export async function AskPanel({ question }: { question?: string }) {
  const user = await getLocalUser();
  const result = question && user ? await askInbox(user.id, question) : null;
  const hits = result?.ok ? (result.sources ?? []) : [];
  const unread = hits.filter((h) => !h.message.isRead).map((h) => h.message.id);
  const archivable = hits.filter((h) => !h.message.isArchived).map((h) => h.message.id);
  const recs = recommendations(hits);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          <Sparkles size={15} className="text-indigo-500" />
          Assistant
        </h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          Answers grounded in your local mail - nothing leaves this machine.
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {result?.ok && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/30">
            <p className="text-xs font-medium tracking-wide text-indigo-500 uppercase">
              {question}
            </p>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">
              {result.answer}
            </p>
          </div>
        )}

        {result && !result.ok && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            {result.reason ?? "Could not answer - is AI enabled in Settings?"}
          </p>
        )}

        {hits.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
                Findings
              </p>
              <span className="flex gap-1.5">
                {unread.length > 0 && (
                  <form action={markMessagesRead.bind(null, unread, true)}>
                    <button
                      type="submit"
                      title="Mark all cited messages read"
                      className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      <CheckCheck size={11} /> Read all
                    </button>
                  </form>
                )}
                {archivable.length > 0 && (
                  <form action={archiveMessages.bind(null, archivable)}>
                    <button
                      type="submit"
                      title="Archive all cited messages"
                      className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      <Archive size={11} /> Archive all
                    </button>
                  </form>
                )}
              </span>
            </div>
            <div className="space-y-1.5">
              {hits.map((hit, i) => (
                <Link
                  key={hit.message.id}
                  href={`/?thread=${hit.message.threadId ?? hit.message.id}`}
                  className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:border-indigo-300 hover:bg-white dark:border-zinc-800 dark:hover:border-indigo-800 dark:hover:bg-zinc-900"
                >
                  <span className="shrink-0 text-[11px] font-medium text-indigo-500">
                    [{i + 1}]
                  </span>
                  {!hit.message.isRead && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                  )}
                  <span className="truncate text-zinc-700 dark:text-zinc-200">
                    {hit.message.subject ?? "(no subject)"}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-zinc-400">
                    {hit.message.fromName ?? hit.message.fromAddress} · ✦ {hit.score.toFixed(2)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {recs.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">
              Suggested next steps
            </p>
            <div className="space-y-1.5">
              {recs.map((r) => (
                <Link
                  key={r.href + r.label}
                  href={r.href}
                  className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-sm text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
                >
                  {r.label}
                  <ArrowRight size={13} className="ml-auto shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {!result && (
          <div className="space-y-2 pt-6 text-center text-sm text-zinc-400">
            <p>Ask anything about your mail:</p>
            <ul className="space-y-1 text-xs">
              <li>&quot;what did Alice say about the hiking trip?&quot;</li>
              <li>&quot;any invoices I still need to pay?&quot;</li>
              <li>&quot;who owes me a reply right now?&quot;</li>
              <li>&quot;summarize the thread with the landlord&quot;</li>
            </ul>
            <p className="pt-2 text-[11px]">
              Short keywords still search the list instantly - questions come here.
            </p>
          </div>
        )}
      </div>

      <form action="/" method="get" className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <input
          name="ask"
          type="text"
          autoFocus
          defaultValue={question ?? ""}
          placeholder="Ask a follow-up…"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </form>
    </div>
  );
}
