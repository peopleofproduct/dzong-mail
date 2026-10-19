"use client";

import { useState } from "react";
import { Check, RefreshCw, Sparkles, X } from "lucide-react";
import { generateReplyVariantsNow, saveReplyDraftNow } from "@/lib/actions";

interface Variant {
  key: string;
  body: string;
}

/**
 * "Draft reply with AI" — generates three styled variants, opens a picker so
 * the user reads and chooses, then persists the chosen body as the thread
 * draft (which then shows in the reply preview).
 */
export function AiDraftButton({
  messageId,
  className = "",
}: {
  messageId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy("gen");
    setError(null);
    const r = await generateReplyVariantsNow(messageId);
    setBusy(null);
    if (r.ok && r.variants && r.variants.length > 0) {
      setVariants(r.variants);
      setOpen(true);
    } else {
      setError(r.reason ?? "AI failed to draft a reply");
    }
  };

  const pick = async (body: string) => {
    setBusy("save");
    setError(null);
    const r = await saveReplyDraftNow(messageId, body);
    setBusy(null);
    if (r.ok) {
      setOpen(false);
      setVariants(null);
    } else {
      setError(r.reason ?? "Could not save the draft");
    }
  };

  return (
    <>
      <button type="button" onClick={generate} disabled={busy !== null} className={className}>
        <Sparkles size={14} />
        {busy === "gen" ? "Drafting 3 versions…" : "Draft reply with AI"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}

      {open && variants && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-xl bg-white shadow-2xl sm:rounded-xl dark:bg-zinc-950 dark:ring-1 dark:ring-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Pick a reply draft
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-600"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {variants.map((v) => (
                <div
                  key={v.key}
                  className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-700 uppercase dark:bg-indigo-950 dark:text-indigo-300">
                      {v.key}
                    </span>
                    <button
                      onClick={() => pick(v.body)}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      <Check size={11} />
                      {busy === "save" ? "Saving…" : "Use this draft"}
                    </button>
                  </div>
                  <p className="mt-2 max-h-48 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                    {v.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <button
                onClick={generate}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <RefreshCw size={12} className={busy === "gen" ? "animate-spin" : ""} />
                Regenerate
              </button>
              <span className="text-[11px] text-zinc-400">Generated locally on your model</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
