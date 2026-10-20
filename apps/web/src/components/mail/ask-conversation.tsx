"use client";

import { useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { AssistantStream } from "./assistant-pane";

interface Turn {
  question: string;
  answer?: string;
}

/**
 * Conversation wrapper around AssistantStream - each follow-up appends a
 * turn, and prior turns ride along as history so the assistant can resolve
 * "and the unread ones?" style follow-ups. Keyed on the initial question by
 * the parent so a fresh top-bar question starts a clean conversation.
 */
export function AskConversation({ initial }: { initial?: string }) {
  const [turns, setTurns] = useState<Turn[]>(initial ? [{ question: initial }] : []);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setInput("");
    setTurns((t) => [...t, { question: q }]);
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
    );
  }

  function recordAnswer(index: number, answer: string) {
    setTurns((t) => t.map((turn, i) => (i === index ? { ...turn, answer } : turn)));
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        {turns.length === 0 ? (
          <div className="space-y-2 pt-6 text-center text-sm text-zinc-400">
            <p>Ask anything about your mail:</p>
            <ul className="space-y-1 text-xs">
              <li>&quot;what did Alice say about the hiking trip?&quot;</li>
              <li>&quot;any invoices I still need to pay?&quot;</li>
              <li>&quot;who owes me a reply right now?&quot;</li>
              <li>&quot;summarize the thread with the landlord&quot;</li>
            </ul>
            <p className="pt-2 text-[11px]">
              Follow-ups remember the conversation - try &quot;and the unread ones?&quot;
            </p>
          </div>
        ) : (
          turns.map((turn, i) => (
            <AssistantStream
              key={`${i}-${turn.question}`}
              question={turn.question}
              history={turns
                .slice(0, i)
                .flatMap((t) => (t.answer ? [{ question: t.question, answer: t.answer }] : []))}
              onComplete={(answer) => recordAnswer(i, answer)}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={submit}
        className="flex gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800"
      >
        <input
          type="text"
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={turns.length > 0 ? "Ask a follow-up…" : "Ask about your mail…"}
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="rounded-lg bg-indigo-600 px-3 text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          <ArrowUp size={15} />
        </button>
      </form>
    </div>
  );
}
