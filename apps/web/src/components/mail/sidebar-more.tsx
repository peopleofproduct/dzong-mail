"use client";

import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const KEY = "dzong-sidebar-more";
const EVENT = "dzong-sidebar-more-change";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Gmail's "More" row: hides secondary views/folders behind a chevron toggle.
 * `defaultOpen` comes from the server when the active view lives inside; an
 * explicit user toggle is remembered in localStorage afterwards.
 */
export function SidebarMore({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const open = useSyncExternalStore(
    subscribe,
    () => {
      const v = localStorage.getItem(KEY);
      return v === null ? defaultOpen : v === "open";
    },
    () => defaultOpen,
  );

  const toggle = () => {
    localStorage.setItem(KEY, open ? "closed" : "open");
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
      >
        {open ? (
          <ChevronUp size={14} className="shrink-0" />
        ) : (
          <ChevronDown size={14} className="shrink-0" />
        )}
        {open ? "Less" : "More"}
      </button>
      {open && children}
    </>
  );
}
