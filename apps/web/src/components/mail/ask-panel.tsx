import { Sparkles } from "lucide-react";
import { AssistantStream } from "./assistant-pane";

/**
 * The assistant pane. Accepts any natural-language question, streams a
 * grounded answer, cites the messages it used, and offers the next
 * actions that make sense for what it found.
 */
export function AskPanel({ question }: { question?: string }) {
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

      <div className="flex-1 overflow-y-auto p-5">
        {question ? (
          <AssistantStream key={question} question={question} />
        ) : (
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
