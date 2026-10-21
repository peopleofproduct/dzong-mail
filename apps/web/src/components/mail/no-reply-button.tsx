"use client";

import { useState } from "react";
import { UserX, X } from "lucide-react";
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

  const optionBtn =
    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-50";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="No reply needed — dismiss this thread"
        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        <X size={11} /> No reply needed
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
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
            className="w-full max-w-sm rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl dark:bg-zinc-950 dark:ring-1 dark:ring-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              No reply needed?
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              This archives the thread. Mail from{" "}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {senderAddress}
              </span>{" "}
              can keep asking for replies — or never again.
            </p>

            {dismissals >= 2 && (
              <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                You&apos;ve cleared {dismissals} threads from this sender before — &quot;always&quot;
                is probably the right call.
              </p>
            )}

            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => pick("once")}
                disabled={busy !== null}
                className={`${optionBtn} border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900`}
              >
                <span>
                  <span className="block font-medium text-zinc-800 dark:text-zinc-200">
                    Just this thread
                  </span>
                  <span className="block text-[11px] text-zinc-500">
                    Future mail from this sender can still need a reply
                  </span>
                </span>
                {busy === "once" && <span className="text-xs text-zinc-400">…</span>}
              </button>

              <button
                type="button"
                onClick={() => pick("always")}
                disabled={busy !== null}
                className={`${optionBtn} border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50`}
              >
                <span className="flex items-center gap-2">
                  <UserX size={14} className="text-indigo-500" />
                  <span>
                    <span className="block font-medium text-indigo-800 dark:text-indigo-300">
                      Always for this sender
                    </span>
                    <span className="block text-[11px] text-indigo-500/80 dark:text-indigo-400/80">
                      Their threads stop appearing in needs-reply — revocable in Settings
                    </span>
                  </span>
                </span>
                {busy === "always" && <span className="text-xs text-indigo-400">…</span>}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 w-full text-center text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Keep it in the queue
            </button>
          </div>
        </div>
      )}
    </>
  );
}
