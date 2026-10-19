"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildParams } from "./params";

const GO_TO: Record<string, string> = {
  i: "inbox",
  s: "starred",
  d: "drafts",
  t: "sent",
  a: "archive",
  n: "newsletters",
  r: "needs-reply",
  w: "awaiting",
  z: "snoozed",
};

const HELP: Array<{ keys: string; action: string }> = [
  { keys: "j / k / ↑ / ↓", action: "Move selection" },
  { keys: "Enter / o", action: "Open selected thread" },
  { keys: "g g / G", action: "Jump to top / bottom" },
  { keys: "x", action: "Toggle checkbox on selected" },
  { keys: "⇧A", action: "Select all visible" },
  { keys: "e", action: "Archive selected / checked" },
  { keys: "z", action: "Undo last archive" },
  { keys: "v then i/a/t", action: "Move to Inbox / Archive / Trash" },
  { keys: "s", action: "Star / unstar" },
  { keys: "u", action: "Toggle read / unread" },
  { keys: "h", action: "Snooze 24 hours" },
  { keys: "r / f", action: "Reply / Forward open thread" },
  { keys: "c", action: "Compose new message" },
  { keys: "⌘⏎ / Ctrl⏎", action: "Send (inside composer)" },
  { keys: "/", action: "Focus search" },
  { keys: "g then i/s/d/t/a/n", action: "Go to Inbox/Starred/Drafts/Sent/Archive/Newsletters" },
  { keys: "g then r/w/z", action: "Needs reply / Awaiting / Snoozed" },
  { keys: "⌘K", action: "Command palette" },
  { keys: "Esc", action: "Clear selection, then close composer / thread" },
  { keys: "?", action: "Toggle this help" },
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [helpOpen, setHelpOpen] = useState(false);
  const gPending = useRef<number>(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      // g-chord: press g, then a view key within 1s.
      if (e.key === "g") {
        gPending.current = Date.now();
        return;
      }
      if (gPending.current && Date.now() - gPending.current < 1000) {
        const view = GO_TO[e.key];
        gPending.current = 0;
        if (view) {
          e.preventDefault();
          router.push(buildParams(searchParams, { view, selected: undefined, thread: undefined }));
        }
        return;
      }

      switch (e.key) {
        case "r":
          // Reuse the thread panel's reply link so params stay consistent.
          document.getElementById("thread-reply")?.click();
          break;
        case "f":
          document.getElementById("thread-forward")?.click();
          break;
        case "Escape":
          if (searchParams.get("compose")) {
            router.push(buildParams(searchParams, { compose: undefined }));
          } else if (searchParams.get("thread")) {
            router.push(buildParams(searchParams, { thread: undefined }));
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, searchParams]);

  if (!helpOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => setHelpOpen(false)}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Keyboard shortcuts
        </h3>
        <ul className="flex flex-col gap-1.5">
          {HELP.map((h) => (
            <li key={h.keys} className="flex items-baseline justify-between gap-4 text-xs">
              <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {h.keys}
              </kbd>
              <span className="text-zinc-500 dark:text-zinc-400">{h.action}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
