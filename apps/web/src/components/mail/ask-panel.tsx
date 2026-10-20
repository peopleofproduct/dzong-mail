import { Sparkles } from "lucide-react";
import { AskConversation } from "./ask-conversation";

/**
 * The assistant pane. Accepts any natural-language question, streams a
 * grounded answer, cites the messages it used, offers the next actions
 * that make sense, and remembers the conversation across follow-ups.
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

      <AskConversation key={question ?? "new"} initial={question} />
    </div>
  );
}
