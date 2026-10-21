"use client";

import { Check, RefreshCw, Sparkles, X } from "lucide-react";

export interface DraftVariant {
  key: string;
  body: string;
}

interface VariantPickerProps {
  variants: DraftVariant[];
  /** Disables pick/regenerate while a generate or save is in flight. */
  busy: boolean;
  /** True while new variants are being generated — cards shimmer. */
  generating?: boolean;
  /** Label on each card's pick button (e.g. "Use this draft" / "Insert"). */
  pickLabel?: string;
  onPick: (body: string) => void;
  onRegenerate: () => void;
  onClose: () => void;
}

/** Shimmered copy block shown while the model writes fresh variants. */
function SkeletonCopy() {
  return (
    <div className="flex-1 animate-pulse space-y-2 pt-1">
      {[100, 92, 96, 68, 88, 45].map((w, i) => (
        <div
          key={i}
          className="h-2.5 rounded-full bg-zinc-200/80 dark:bg-zinc-800"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}

/** Modal listing generated draft variants — side-by-side tiles on desktop,
 *  stacked cards on small screens. Read each, pick one, regenerate. */
export function VariantPicker({
  variants,
  busy,
  generating = false,
  pickLabel = "Use this draft",
  onPick,
  onRegenerate,
  onClose,
}: VariantPickerProps) {
  return (
    // stopPropagation on the backdrop too: when rendered inside the composer
    // (which closes on backdrop click) a stray click must not close both.
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Pick a draft"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-zinc-200/70 sm:max-w-4xl sm:rounded-2xl dark:bg-zinc-950 dark:ring-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800/70">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <Sparkles size={16} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Pick a draft
            </h3>
            <p className="text-xs text-zinc-400">
              {variants.length} takes on this reply — choose the one that sounds like you
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X size={16} />
          </button>
        </div>

        {/* Variant tiles — horizontal on sm+, stacked below that */}
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-3 sm:p-5">
          {variants.map((v) => (
            <div
              key={v.key}
              className={`group flex min-h-44 flex-col rounded-xl border border-zinc-200/80 bg-white transition-all duration-150 sm:min-h-0 dark:border-zinc-800 dark:bg-zinc-900/40 ${
                generating
                  ? ""
                  : "hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/10 dark:hover:border-indigo-800"
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-indigo-600 uppercase ring-1 ring-indigo-100 ring-inset dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-indigo-900">
                  {v.key}
                </span>
                {generating && (
                  <span className="text-[10px] font-medium text-indigo-400 dark:text-indigo-300">
                    writing…
                  </span>
                )}
              </div>

              {generating ? (
                <div className="px-3.5 pb-3">
                  <SkeletonCopy />
                </div>
              ) : (
                <div className="relative min-h-0 flex-1 px-3.5 pt-2 pb-2">
                  <p className="max-h-36 overflow-hidden text-[12.5px] leading-relaxed whitespace-pre-wrap text-zinc-600 sm:max-h-52 dark:text-zinc-300">
                    {v.body}
                  </p>
                  {/* Fade hint that more copy exists below the fold. */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 rounded-b-xl bg-gradient-to-t from-white to-transparent dark:from-zinc-900/40" />
                </div>
              )}

              <div className="mt-auto px-3.5 pb-3.5">
                <button
                  onClick={() => onPick(v.body)}
                  disabled={busy}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors group-hover:bg-indigo-600 group-hover:text-white hover:!bg-indigo-500 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-200 dark:group-hover:bg-indigo-600 dark:hover:!bg-indigo-500"
                >
                  <Check size={12} />
                  {pickLabel}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3.5 dark:border-zinc-800/70">
          <button
            onClick={onRegenerate}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <RefreshCw size={12} className={generating ? "animate-spin" : ""} />
            {generating ? "Regenerating…" : "Regenerate"}
          </button>
          <span className="text-[11px] text-zinc-400">Generated locally on your model</span>
        </div>
      </div>
    </div>
  );
}
