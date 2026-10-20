"use client";

import { Check, RefreshCw, X } from "lucide-react";

export interface DraftVariant {
  key: string;
  body: string;
}

interface VariantPickerProps {
  variants: DraftVariant[];
  /** Disables pick/regenerate while a generate or save is in flight. */
  busy: boolean;
  /** Label on each card's pick button (e.g. "Use this draft" / "Insert"). */
  pickLabel?: string;
  onPick: (body: string) => void;
  onRegenerate: () => void;
  onClose: () => void;
}

/** Modal listing generated draft variants — read each, pick one, regenerate. */
export function VariantPicker({
  variants,
  busy,
  pickLabel = "Use this draft",
  onPick,
  onRegenerate,
  onClose,
}: VariantPickerProps) {
  return (
    // stopPropagation on the backdrop too: when rendered inside the composer
    // (which closes on backdrop click) a stray click must not close both.
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
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
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-xl bg-white shadow-2xl sm:rounded-xl dark:bg-zinc-950 dark:ring-1 dark:ring-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Pick a draft</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {variants.map((v) => (
            <div key={v.key} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-700 uppercase dark:bg-indigo-950 dark:text-indigo-300">
                  {v.key}
                </span>
                <button
                  onClick={() => onPick(v.body)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Check size={11} />
                  {pickLabel}
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
            onClick={onRegenerate}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <RefreshCw size={12} />
            Regenerate
          </button>
          <span className="text-[11px] text-zinc-400">Generated locally on your model</span>
        </div>
      </div>
    </div>
  );
}
