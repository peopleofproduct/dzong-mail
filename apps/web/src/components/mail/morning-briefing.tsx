"use client";

import { useState, useSyncExternalStore } from "react";
import { Coffee, X } from "lucide-react";

const DISMISS_KEY = "unwalled-briefing-dismissed";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

interface BriefingStats {
  inserted: number;
  classified: number;
  rulesApplied: number;
  sent: number;
  unsnoozed: number;
  followUpReminders: number;
  draftsWaiting: number;
  followUpsWaiting: number;
}

/**
 * "While you slept" card — summarizes overnight background activity. Shown
 * once per local day; dismissal persists in localStorage.
 */
export function MorningBriefingCard({ stats, dateKey }: { stats: BriefingStats; dateKey: string }) {
  const dismissed = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(DISMISS_KEY) === dateKey,
    () => false,
  );
  const [hidden, setHidden] = useState(false);
  if (dismissed || hidden) return null;

  const parts = [
    stats.inserted > 0 && `${stats.inserted} new message${stats.inserted === 1 ? "" : "s"}`,
    stats.classified > 0 && `${stats.classified} auto-labeled`,
    stats.rulesApplied > 0 && `${stats.rulesApplied} rule action${stats.rulesApplied === 1 ? "" : "s"}`,
    stats.sent > 0 && `${stats.sent} scheduled send${stats.sent === 1 ? "" : "s"} dispatched`,
    stats.unsnoozed > 0 && `${stats.unsnoozed} snoozed returned`,
    stats.followUpReminders > 0 && `${stats.followUpReminders} follow-up reminder${stats.followUpReminders === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[];

  const pending = [
    stats.draftsWaiting > 0 && `${stats.draftsWaiting} AI draft${stats.draftsWaiting === 1 ? "" : "s"} waiting for review`,
    stats.followUpsWaiting > 0 && `${stats.followUpsWaiting} thread${stats.followUpsWaiting === 1 ? "" : "s"} still awaiting replies`,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-3 mt-3 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-indigo-900/50 dark:bg-indigo-950/30">
      <Coffee size={16} className="mt-0.5 shrink-0 text-indigo-500" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-100">
          While you slept
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-indigo-700 dark:text-indigo-300">
          {parts.length > 0 ? parts.join(" · ") : "Quiet night — no new mail activity."}
        </p>
        {pending.length > 0 && (
          <p className="mt-1 text-xs font-medium text-indigo-800 dark:text-indigo-200">
            Waiting on you: {pending.join(" · ")}
          </p>
        )}
      </div>
      <button
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, dateKey);
          window.dispatchEvent(new Event("storage"));
          setHidden(true);
        }}
        aria-label="Dismiss briefing"
        className="shrink-0 rounded p-1 text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900"
      >
        <X size={14} />
      </button>
    </div>
  );
}
