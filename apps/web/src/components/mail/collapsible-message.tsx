"use client";

import { useState, type ReactNode } from "react";

interface CollapsibleMessageProps {
  id: string;
  defaultOpen: boolean;
  /** One-line row shown while collapsed (sender, snippet, date). */
  summary: ReactNode;
  /** Full header shown while expanded; clicking it collapses again. */
  header: ReactNode;
  /** Everything below the header: body, attachments, draft actions. */
  body: ReactNode;
}

/** Gmail-style collapsible message inside a thread — only the latest is
 *  open by default; the header row toggles in both directions. */
export function CollapsibleMessage({ id, defaultOpen, summary, header, body }: CollapsibleMessageProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div id={id}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full text-left transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40"
      >
        {open ? header : summary}
      </button>
      {open && body}
    </div>
  );
}
