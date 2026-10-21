"use client";

import { useState } from "react";
import { Archive, ShieldOff, UserX, X } from "lucide-react";
import { dismissReplyThread } from "@/lib/actions";

/**
 * "No reply needed" — asks once before dismissing: just this thread, or
 * always for this sender (permanently suppresses them from the reply
 * queue). Repeated one-off dismissals of the same sender surface the
 * "always" recommendation — the queue learns from the user's clears.
 */
export function NoReplyButton({
  threadId,
  senderAddress,
  dismissals = 0,
}: {
  threadId: string;
  senderAddress: string;
  /** Times this sender's threads were dismissed "just this once" already. */
  dismissals?: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"once" | "always" | null>(null);

  const pick = async (scope: "once" | "always") => {
    setBusy(scope);
    await dismissReplyThread(threadId, senderAddress, scope);
    setBusy(null);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="No reply needed — dismiss this thread"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        <X size={11} /> No reply needed
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Dismiss thread from reply queue"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-950/10 sm:rounded-2xl dark:bg-zinc-900 dark:ring-zinc-700/50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative px-5 pt-5 pb-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute top-4 right-4 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <X size={14} />
              </button>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/60">
                <Archive size={17} className="text-indigo-500 dark:text-indigo-400" />
              </div>
              <h3 className="mt-3 text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                No reply needed?
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                The thread gets archived. Choose whether{" "}
                <span className="font-medium break-all text-zinc-700 dark:text-zinc-300">
                  {senderAddress}
                </span>{" "}
                can come back asking for replies.
              </p>
            </div>

            {/* Learning nudge — earned after two one-off clears. */}
            {dismissals >= 2 && (
              <div className="mx-5 mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                <span className="shrink-0">✦</span>
                <span>
                  You&apos;ve cleared {dismissals} threads from this sender — &quot;always&quot; is
                  probably the right call.
                </span>
              </div>
            )}

            {/* Options */}
            <div className="flex flex-col gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => pick("once")}
                disabled={busy !== null}
                className="group flex items-center gap-3.5 rounded-xl border border-zinc-200 px-4 py-3.5 text-left transition-all hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 transition-colors group-hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700">
                  <Archive size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {busy === "once" ? "Archiving…" : "Just this thread"}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-zinc-500 dark:text-zinc-400">
                    Future mail from them can still need a reply
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => pick("always")}
                disabled={busy !== null}
                className="group flex items-center gap-3.5 rounded-xl border border-indigo-200 bg-indigo-50/40 px-4 py-3.5 text-left transition-all hover:border-indigo-300 hover:bg-indigo-50 active:scale-[0.99] disabled:opacity-50 dark:border-indigo-900/60 dark:bg-indigo-950/25 dark:hover:border-indigo-800 dark:hover:bg-indigo-950/45"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 transition-colors group-hover:bg-indigo-200/80 dark:bg-indigo-950/70 dark:text-indigo-400 dark:group-hover:bg-indigo-900/70">
                  <UserX size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-indigo-900 dark:text-indigo-200">
                    {busy === "always" ? "Suppressing…" : "Always for this sender"}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-indigo-600/80 dark:text-indigo-400/80">
                    They leave needs-reply for good — undo anytime in Settings
                  </span>
                </span>
                <ShieldOff
                  size={14}
                  className="shrink-0 text-indigo-300 dark:text-indigo-700"
                />
              </button>
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-lg py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-600 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-300"
              >
                Keep it in the queue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
