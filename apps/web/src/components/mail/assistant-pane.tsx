"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowRight,
  Check,
  CheckCheck,
  Loader2,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { archiveMessages, markMessagesRead, undoAuditEntry } from "@/lib/actions";

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

/** A confirm-gated mutation the assistant proposed over its findings. */
interface ProposedAction {
  kind: string;
  label: string;
  messageIds: string[];
  preview: { messageId: string; subject: string | null; from: string }[];
  truncated: boolean;
}

type ActionState = "pending" | "running" | "done" | "dismissed" | "undone" | "failed";

/** Turn a lexical-retrieval reason into concrete next-step guidance. */
function guidanceFor(reason: string | undefined) {
  if (!reason) return null;
  if (reason.includes("embedding") || reason.includes("AI disabled")) {
    return {
      title: "Answers are keyword-only right now",
      body: reason.includes("AI disabled")
        ? "AI is off or unreachable - turn it on for smarter answers."
        : "Add a small local model and answers get much smarter - everything still stays on this machine.",
      command: reason.includes("AI disabled") ? null : "ollama pull nomic-embed-text",
      href: "/settings",
      hrefLabel: "Open AI settings",
    };
  }
  if (reason.includes("not embedded")) {
    return {
      title: "Still indexing your inbox",
      body: "Your inbox is being indexed in the background - answers get smarter once the first pass finishes.",
      command: null,
      href: null,
      hrefLabel: null,
    };
  }
  return null; // "no messages matched" - the badge alone is honest enough
}

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
  const [retrieval, setRetrieval] = useState<"semantic" | "lexical">("semantic");
  const [retrievalReason, setRetrievalReason] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [actions, setActions] = useState<ProposedAction[]>([]);
  const [actionStates, setActionStates] = useState<Record<number, ActionState>>({});
  const [auditIds, setAuditIds] = useState<Record<number, string>>({});
  const answerRef = useRef<HTMLParagraphElement>(null);
  const router = useRouter();

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
                | { type: "status"; stage: string }
                | { type: "sources"; sources: Source[] }
                | { type: "token"; text: string }
                | {
                    type: "done";
                    answer: string;
                    sources: Source[];
                    retrieval: string;
                    retrievalReason?: string;
                    actions?: ProposedAction[];
                  }
                | { type: "error"; reason: string };
              if (cancelled) return;
              if (evt.type === "sources") {
                // Findings render while the answer is still generating.
                setSources(evt.sources);
              } else if (evt.type === "token") {
                setAnswer((a) => a + evt.text);
                setPhase("streaming");
              } else if (evt.type === "done") {
                setSources(evt.sources);
                setRetrieval(evt.retrieval === "lexical" ? "lexical" : "semantic");
                setRetrievalReason(evt.retrievalReason);
                setActions(evt.actions ?? []);
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
  const guide = phase === "done" ? guidanceFor(retrievalReason) : null;

  /** Run a proposed action after the user explicitly confirms it. */
  async function runAction(index: number) {
    const action = actions[index];
    if (!action) return;
    setActionStates((m) => ({ ...m, [index]: "running" }));
    try {
      const res = await fetch("/api/v1/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: action.kind, messageIds: action.messageIds }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        auditId?: string;
      };
      if (!res.ok || !data.ok) throw new Error("execute failed");
      if (data.auditId) setAuditIds((m) => ({ ...m, [index]: data.auditId! }));
      setActionStates((m) => ({ ...m, [index]: "done" }));
      router.refresh();
    } catch {
      setActionStates((m) => ({ ...m, [index]: "failed" }));
    }
  }

  /** Reverse an executed action through the shared audit trail. */
  async function undoAction(index: number) {
    const auditId = auditIds[index];
    if (!auditId) return;
    const result = await undoAuditEntry(auditId);
    if (result.ok) {
      setActionStates((m) => ({ ...m, [index]: "undone" }));
      router.refresh();
    }
  }

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
          {error ?? "Could not answer"}{" "}
          <Link href="/settings" className="font-medium underline underline-offset-2">
            Check AI settings
          </Link>
        </p>
      )}

      {sources.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
              Findings
              {retrieval === "lexical" && (
                <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-medium text-amber-700 normal-case dark:bg-amber-950 dark:text-amber-300">
                  keyword matches
                </span>
              )}
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

      {phase === "done" &&
        actions.map((action, i) => {
          const state = actionStates[i] ?? "pending";
          if (state === "dismissed") return null;
          return (
            <div
              key={`${action.kind}-${i}`}
              className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900/50 dark:bg-violet-950/30"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-800 dark:text-violet-200">
                <Sparkles size={13} />
                {state === "done" || state === "undone" ? "Done" : "Proposed action"}
              </p>
              <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-100">
                {action.label}
                {action.truncated && (
                  <span className="text-zinc-400"> (first {action.messageIds.length} shown)</span>
                )}
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {action.preview.map((p) => (
                  <li
                    key={p.messageId}
                    className="truncate text-xs text-zinc-500 dark:text-zinc-400"
                  >
                    {p.subject ?? "(no subject)"} - {p.from}
                  </li>
                ))}
                {action.messageIds.length > action.preview.length && (
                  <li className="text-[11px] text-zinc-400">
                    +{action.messageIds.length - action.preview.length} more
                  </li>
                )}
              </ul>
              <div className="mt-2.5 flex items-center gap-2">
                {state === "pending" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void runAction(i)}
                      className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500"
                    >
                      <Check size={12} /> Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionStates((m) => ({ ...m, [i]: "dismissed" }))}
                      className="inline-flex items-center gap-1 rounded-md border border-violet-200 px-2.5 py-1 text-xs text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-900/40"
                    >
                      <X size={12} /> Dismiss
                    </button>
                  </>
                )}
                {state === "running" && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-300">
                    <Loader2 size={12} className="animate-spin" /> Applying…
                  </span>
                )}
                {state === "done" && (
                  <>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <Check size={12} /> Applied
                    </span>
                    {auditIds[i] && (
                      <button
                        type="button"
                        onClick={() => void undoAction(i)}
                        className="inline-flex items-center gap-1 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        <Undo2 size={11} /> Undo
                      </button>
                    )}
                  </>
                )}
                {state === "undone" && (
                  <span className="text-xs text-zinc-500">Undone - nothing changed.</span>
                )}
                {state === "failed" && (
                  <span className="text-xs text-red-500">Couldn&apos;t apply that action.</span>
                )}
              </div>
            </div>
          );
        })}

      {guide && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
            <Sparkles size={13} /> {guide.title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            {guide.body}
          </p>
          {(guide.command || guide.href) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {guide.command && (
                <button
                  type="button"
                  onClick={() => {
                    const cmd = guide.command;
                    if (!cmd) return;
                    navigator.clipboard.writeText(cmd).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                  title="Copy to clipboard"
                  className="rounded bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {copied ? "Copied" : guide.command}
                </button>
              )}
              {guide.href && (
                <Link
                  href={guide.href}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 underline underline-offset-2 dark:text-amber-200"
                >
                  {guide.hrefLabel}
                  <ArrowRight size={11} />
                </Link>
              )}
            </div>
          )}
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
