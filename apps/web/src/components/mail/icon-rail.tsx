"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Inbox, PanelLeft, Settings, Sparkles } from "lucide-react";

const EVENT = "unwalled-sidebar-change";

function isCollapsed(): boolean {
  return localStorage.getItem("unwalled-sidebar") === "collapsed";
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

const WIDTH_EVENT = "unwalled-sidebar-width";
const WIDTH_KEY = "unwalled-sidebar-width";
const DEFAULT_WIDTH = 224; // w-56
const MIN_WIDTH = 160;
const MAX_WIDTH = 400;

function sidebarWidth(): number {
  const v = Number(localStorage.getItem(WIDTH_KEY));
  return Number.isFinite(v) && v >= MIN_WIDTH && v <= MAX_WIDTH ? v : DEFAULT_WIDTH;
}

function subscribeWidth(cb: () => void) {
  window.addEventListener(WIDTH_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(WIDTH_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

const btn =
  "flex items-center justify-center rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
const btnActive =
  "bg-indigo-100 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300";

/**
 * Gmail-style icon rail on the far left: hamburger collapses the folder
 * sidebar (desktop), mail icon → inbox, sparkles → reply queue with a live
 * pending-count badge, settings at the bottom. The folder sidebar it
 * collapses is passed in as server-rendered children.
 *
 * Also owns the mobile drawer state (peer checkbox) so the same component
 * controls the sidebar on every breakpoint.
 */
export function IconRail({ pending, children }: { pending: number; children: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, isCollapsed, () => false);
  const width = useSyncExternalStore(subscribeWidth, sidebarWidth, () => DEFAULT_WIDTH);
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? "inbox";

  const setWidth = (w: number) => {
    localStorage.setItem(
      WIDTH_KEY,
      String(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)))),
    );
    window.dispatchEvent(new Event(WIDTH_EVENT));
  };

  const startDrag = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => setWidth(startW + ev.clientX - startX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Keep the DOM drawer state in sync when hydration restores a saved
  // collapse preference.
  useEffect(() => {
    document.documentElement.classList.toggle("sidebar-collapsed", collapsed);
  }, [collapsed]);

  const toggle = () => {
    localStorage.setItem("unwalled-sidebar", collapsed ? "" : "collapsed");
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <>
      {/* Mobile drawer toggle — checkbox state drives the slide-in below. */}
      <input id="nav-toggle" type="checkbox" className="peer hidden" />

      <nav className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-zinc-200 bg-white px-1.5 py-3 md:flex dark:border-zinc-800 dark:bg-zinc-950">
        <button
          onClick={toggle}
          title={collapsed ? "Show folders" : "Hide folders"}
          aria-label={collapsed ? "Show folders" : "Hide folders"}
          className={btn}
        >
          <PanelLeft size={17} />
        </button>

        <Link
          href="/?view=inbox"
          title="Inbox"
          className={`${btn} ${view === "inbox" ? btnActive : ""}`}
        >
          <Inbox size={17} />
        </Link>

        <Link
          href="/?view=reply-queue"
          title="Reply queue — threads waiting on you, drafts ready to review"
          className={`relative ${btn} ${view === "reply-queue" ? btnActive : ""}`}
        >
          <Sparkles size={17} />
          {pending > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-semibold text-white">
              {pending > 99 ? "99+" : pending}
            </span>
          )}
        </Link>

        <a href="/settings" title="Settings" className={`${btn} mt-auto`}>
          <Settings size={16} />
        </a>
      </nav>

      {/* Folder sidebar — collapsible on desktop via the rail button, a
          slide-in drawer on mobile via the peer checkbox. Width is
          user-adjustable on md+ via the drag handle on its right edge. */}
      <div
        className={`fixed inset-y-0 left-0 z-40 h-full w-64 -translate-x-full bg-white transition-transform duration-200 peer-checked:translate-x-0 md:relative md:z-auto md:h-auto md:w-[var(--sidebar-w)] md:shrink-0 md:translate-x-0 md:transition-none dark:bg-zinc-950 ${
          collapsed ? "md:hidden" : ""
        }`}
        style={{ "--sidebar-w": `${width}px` } as CSSProperties}
      >
        {children}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          title="Drag to resize · double-click to reset"
          onPointerDown={startDrag}
          onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
          className="group absolute inset-y-0 right-0 z-10 hidden w-3 cursor-col-resize items-center justify-center hover:bg-indigo-200/50 active:bg-indigo-300/50 md:flex dark:hover:bg-indigo-800/50 dark:active:bg-indigo-700/50"
        >
          {/* Always-visible grip so the handle is discoverable. */}
          <span className="h-8 w-1 rounded-full bg-zinc-300 transition-colors group-hover:bg-indigo-500 group-active:bg-indigo-600 dark:bg-zinc-600" />
        </div>
      </div>
      <label
        htmlFor="nav-toggle"
        aria-hidden
        className="fixed inset-0 z-30 hidden bg-black/40 peer-checked:block md:hidden"
      />
    </>
  );
}
