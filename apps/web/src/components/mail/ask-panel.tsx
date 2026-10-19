import Link from "next/link";
import { Sparkles } from "lucide-react";
import { askInbox } from "@unwalled/sync-engine";
import { getLocalUser } from "@/lib/queries";

export async function AskPanel({ question }: { question?: string }) {
  const user = await getLocalUser();
  const result = question && user ? await askInbox(user.id, question) : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          <Sparkles size={15} className="text-indigo-500" />
          Ask my inbox
        </h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          Semantic search over your local mail, answered by your AI — nothing leaves this machine.
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
            {result.reason ?? "Could not answer — is AI enabled in Settings?"}
          </p>
        )}

        {result?.ok && result.sources && result.sources.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">
              Sources
            </p>
            <div className="space-y-1.5">
              {result.sources.map((hit, i) => (
                <Link
                  key={hit.message.id}
                  href={`/?thread=${hit.message.threadId ?? hit.message.id}`}
                  className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:border-indigo-300 hover:bg-white dark:border-zinc-800 dark:hover:border-indigo-800 dark:hover:bg-zinc-900"
                >
                  <span className="shrink-0 text-[11px] font-medium text-indigo-500">
                    [{i + 1}]
                  </span>
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

        {!result && (
          <div className="space-y-2 pt-6 text-center text-sm text-zinc-400">
            <p>Try questions like:</p>
            <ul className="space-y-1 text-xs">
              <li>&quot;what did Alice say about the hiking trip?&quot;</li>
              <li>&quot;any receipts or invoices this month?&quot;</li>
              <li>&quot;summarize the Linear sprint thread&quot;</li>
            </ul>
          </div>
        )}
      </div>

      <form action="/" method="get" className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <input
          name="ask"
          type="text"
          autoFocus
          defaultValue={question ?? ""}
          placeholder="Ask about anything in your mail…"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </form>
    </div>
  );
}
