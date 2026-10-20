"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * Resizable pane width, persisted to localStorage and shared across
 * components via a custom event (same pattern as the sidebar collapse).
 * `startDrag` attaches to a handle: pointermove adjusts width live,
 * pointerup ends the drag.
 */
export function usePaneWidth(storageKey: string, defaultWidth: number, min: number, max: number) {
  const store = useMemo(() => {
    const event = `${storageKey}-change`;
    return {
      event,
      subscribe(cb: () => void) {
        window.addEventListener(event, cb);
        window.addEventListener("storage", cb);
        return () => {
          window.removeEventListener(event, cb);
          window.removeEventListener("storage", cb);
        };
      },
      snapshot() {
        const v = Number(localStorage.getItem(storageKey));
        return Number.isFinite(v) && v >= min && v <= max ? v : defaultWidth;
      },
    };
  }, [storageKey, defaultWidth, min, max]);

  const width = useSyncExternalStore(store.subscribe, store.snapshot, () => defaultWidth);

  const setWidth = (w: number) => {
    localStorage.setItem(storageKey, String(Math.min(max, Math.max(min, Math.round(w)))));
    window.dispatchEvent(new Event(store.event));
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

  return { width, setWidth, startDrag };
}

interface ResizeHandleProps {
  onPointerDown: (e: ReactPointerEvent) => void;
  onDoubleClick: () => void;
  /** Breakpoint pair controlling visibility, e.g. "sm:flex" or "md:flex". */
  visible?: string;
}

/** Thin edge handle with an always-visible grip pill; drag resizes,
 *  double-click resets to the pane's default width. */
export function ResizeHandle({
  onPointerDown,
  onDoubleClick,
  visible = "md:flex",
}: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize pane"
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className={`group absolute inset-y-0 right-0 z-10 hidden w-3 cursor-col-resize items-center justify-center hover:bg-indigo-200/50 active:bg-indigo-300/50 dark:hover:bg-indigo-800/50 dark:active:bg-indigo-700/50 ${visible}`}
    >
      <span className="h-8 w-1 rounded-full bg-zinc-300 transition-colors group-hover:bg-indigo-500 group-active:bg-indigo-600 dark:bg-zinc-600" />
    </div>
  );
}
