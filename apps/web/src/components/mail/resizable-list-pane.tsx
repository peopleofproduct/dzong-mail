"use client";

import type { CSSProperties, ReactNode } from "react";
import { ResizeHandle, usePaneWidth } from "./resize";

const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;

/**
 * Client wrapper for the message-list column: same resize affordance as the
 * folder sidebar. Width applies only at sm+ (mobile keeps full-width and
 * swaps panes instead of splitting them).
 */
export function ResizableListPane({
  paneOpen,
  children,
}: {
  /** Mirrors the mobile rule: hide the list once a thread/ask pane opens. */
  paneOpen: boolean;
  children: ReactNode;
}) {
  const { width, setWidth, startDrag } = usePaneWidth(
    "dzong-list-width",
    DEFAULT_WIDTH,
    MIN_WIDTH,
    MAX_WIDTH,
  );

  return (
    <section
      className={`${paneOpen ? "hidden md:flex" : "flex"} relative min-h-0 w-full flex-col overflow-hidden border-r border-zinc-200 sm:w-[var(--list-w)] sm:shrink-0 dark:border-zinc-800`}
      style={{ "--list-w": `${width}px` } as CSSProperties}
    >
      {children}
      <ResizeHandle
        onPointerDown={startDrag}
        onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
        visible="sm:flex"
      />
    </section>
  );
}
