"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ArrowRight, Coffee, X } from "lucide-react";

const DISMISS_KEY = "dzong-briefing-dismissed";

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
    stats.rulesApplied > 0 &&
      `${stats.rulesApplied} rule action${stats.rulesApplied === 1 ? "" : "s"}`,
    stats.sent > 0 && `${stats.sent} scheduled send${stats.sent === 1 ? "" : "s"} dispatched`,
    stats.unsnoozed > 0 && `${stats.unsnoozed} snoozed returned`,
    stats.followUpReminders > 0 &&
      `${stats.followUpReminders} follow-up reminder${stats.followUpReminders === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[];

  const pending = [
    stats.draftsWaiting > 0 && {
      text: `${stats.draftsWaiting} AI draft${stats.draftsWaiting === 1 ? "" : "s"} waiting for review`,
      href: "/?view=reply-queue",
      cta: "Review drafts",
    },
    stats.followUpsWaiting > 0 && {
      text: `${stats.followUpsWaiting} thread${stats.followUpsWaiting === 1 ? "" : "s"} still awaiting replies`,
      href: "/?view=awaiting",
      cta: "Check follow-ups",
    },
  ].filter(Boolean) as { text: string; href: string; cta: string }[];

  return (
    <div className="mx-3 mt-3 flex items-start gap-3 rounded-2xl bg-gradient-to-r from-indigo-50 via-violet-50/80 to-indigo-50/40 px-4 py-3.5 ring-1 ring-indigo-100/80 dark:from-indigo-950/50 dark:via-violet-950/30 dark:to-indigo-950/20 dark:ring-indigo-900/40">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm ring-1 ring-indigo-100 dark:bg-indigo-900/50 dark:ring-indigo-800/60">
        <Coffee size={15} className="text-indigo-500 dark:text-indigo-300" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold tracking-tight text-indigo-950 dark:text-indigo-100">
          While you slept
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-indigo-700/90 dark:text-indigo-300/90">
          {parts.length > 0 ? parts.join(" · ") : "Quiet night — no new mail activity."}
        </p>
        {pending.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {pending.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="group inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-indigo-800 ring-1 ring-indigo-100/60 transition-colors hover:bg-white hover:ring-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:ring-indigo-800/50 dark:hover:bg-indigo-900/70"
              >
                {p.text}
                <span className="inline-flex items-center gap-0.5 text-indigo-400 dark:text-indigo-500">
                  {p.cta}{" "}
                  <ArrowRight
                    size={10}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, dateKey);
          window.dispatchEvent(new Event("storage"));
          setHidden(true);
        }}
        aria-label="Dismiss briefing"
        className="shrink-0 rounded-full p-1.5 text-indigo-300 transition-colors hover:bg-white/70 hover:text-indigo-500 dark:text-indigo-600 dark:hover:bg-indigo-900/60 dark:hover:text-indigo-300"
      >
        <X size={13} />
      </button>
    </div>
  );
}
