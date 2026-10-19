"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Archive, ArrowRight, CheckCheck, Loader2 } from "lucide-react";
import { archiveMessages, markMessagesRead } from "@/lib/actions";

interface Source {
  messageId: string;
  threadId: string | null;
  subject: string | null;
  fromName: string | null;
  fromAddress: string;
  isRead: boolean;
  isArchived: boolean;
  aiLabels: string[];
  score: number;
}

type Phase = "thinking" | "streaming" | "done" | "error";

/** Next steps computed from what the answer was grounded on. */
function recommendations(sources: Source[]) {
  const recs: { label: string; href: string }[] = [];
  const bySender = new Map<string, number>();
  for (const s of sources) {
    bySender.set(s.fromAddress, (bySender.get(s.fromAddress) ?? 0) + 1);
  }
  const top = [...bySender.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) {
    recs.push({ label: `Create a rule for ${top[0]}`, href: "/settings" });
  }
  if (sources.some((s) => s.aiLabels.includes("NEEDS_REPLY"))) {
    recs.push({ label: "Open the reply queue", href: "/?view=reply-queue" });
  }
  if (
    sources.some((s) =>
      s.aiLabels.some((l) => ["NEWSLETTER", "MARKETING", "COLD_PITCH"].includes(l)),
    )
  ) {
    recs.push({ label: "Clean up the bulk mail behind this", href: "/?view=digest" });
  }
  return recs;
}

/**
 * Streams the assistant's answer token-by-token from /api/v1/ask, then
 * renders the cited findings with bulk actions and computed next steps.
 * Remounts per question (key={question} from the server panel).
 */
export function AssistantStream({ question }: { question: string }) {
  const [phase, setPhase] = useState<Phase>("thinking");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);
  const answerRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, stream: true }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) {
            setError(data.error ?? `request failed (${res.status})`);
            setPhase("error");
          }
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line) as
                | { type: "token"; text: string }
                | { type: "done"; answer: string; sources: Source[] }
                | { type: "error"; reason: string };
              if (cancelled) return;
              if (evt.type === "token") {
                setAnswer((a) => a + evt.text);
                setPhase("streaming");
              } else if (evt.type === "done") {
                setSources(evt.sources);
                setPhase("done");
              } else if (evt.type === "error") {
                setError(evt.reason);
                setPhase("error");
              }
            } catch {
              // partial JSON line - carried in buf
            }
          }
        }
      } catch (err) {
        if (!cancelled && !(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "stream failed");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [question]);

  // Keep the streamed text scrolled into view inside the pane.
  useEffect(() => {
    answerRef.current?.scrollIntoView({ block: "nearest" });
  }, [answer]);

  const unread = sources.filter((s) => !s.isRead).map((s) => s.messageId);
  const archivable = sources.filter((s) => !s.isArchived).map((s) => s.messageId);
  const recs = recommendations(sources);

  return (
    <div className="space-y-5">
      {(phase === "thinking" || phase === "streaming" || phase === "done") && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/30">
          <p className="text-xs font-medium tracking-wide text-indigo-500 uppercase">
            {question}
          </p>
          {phase === "thinking" ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 size={14} className="animate-spin" /> Reading your inbox…
            </p>
          ) : (
            <p
              ref={answerRef}
              className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-100"
            >
              {answer}
              {phase === "streaming" && (
                <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-indigo-500 align-text-bottom" />
              )}
            </p>
          )}
        </div>
      )}

      {phase === "error" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          {error ?? "Could not answer - is AI enabled in Settings?"}
        </p>
      )}

      {sources.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
              Findings
            </p>
            <span className="flex gap-1.5">
              {unread.length > 0 && (
                <button
                  type="button"
                  onClick={() => markMessagesRead(unread, true)}
                  title="Mark all cited messages read"
                  className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <CheckCheck size={11} /> Read all
                </button>
              )}
              {archivable.length > 0 && (
                <button
                  type="button"
                  onClick={() => archiveMessages(archivable)}
                  title="Archive all cited messages"
                  className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <Archive size={11} /> Archive all
                </button>
              )}
            </span>
          </div>
          <div className="space-y-1.5">
            {sources.map((s, i) => (
              <Link
                key={s.messageId}
                href={`/?thread=${s.threadId ?? s.messageId}`}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:border-indigo-300 hover:bg-white dark:border-zinc-800 dark:hover:border-indigo-800 dark:hover:bg-zinc-900"
              >
                <span className="shrink-0 text-[11px] font-medium text-indigo-500">
                  [{i + 1}]
                </span>
                {!s.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />}
                <span className="truncate text-zinc-700 dark:text-zinc-200">
                  {s.subject ?? "(no subject)"}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-zinc-400">
                  {s.fromName ?? s.fromAddress} · ✦ {s.score.toFixed(2)}
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
    </div>
  );
}
