"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface MessageDetailsData {
  from: string;
  to: string;
  date: string;
  subject: string;
  mailedBy: string | null;
  signedBy: string | null;
  security: string | null;
  /** Local read receipt - when the user first opened the message. */
  openedAt?: string | null;
  /** The message was sent asking recipients for an MDN receipt. */
  receiptRequested?: boolean;
}

/**
 * Gmail-style recipient line: "to me" (or the real recipients) followed by a
 * chevron. Clicking it reveals a details card with the transport facts
 * Gmail shows - from/to/date/subject plus mailed-by, signed-by and TLS.
 */
export function MessageDetails({ to, details }: { to: string; details: MessageDetailsData }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rows: [string, string | null][] = [
    ["from:", details.from],
    ["to:", details.to],
    ["date:", details.date],
    ["subject:", details.subject],
    ["mailed-by:", details.mailedBy],
    ["signed-by:", details.signedBy],
    ["security:", details.security],
    ["opened:", details.openedAt ?? null],
    [
      "receipt:",
      details.receiptRequested ? "read receipt requested - notified when it arrives" : null,
    ],
  ];

  return (
    <div ref={ref} className="relative mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Show details"
        aria-expanded={open}
        className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        to {to}
        <ChevronDown
          size={12}
          className={open ? "rotate-180 transition-transform" : "transition-transform"}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-[26rem] max-w-[85vw] rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <dl className="space-y-1.5">
            {rows.map(([label, value]) =>
              value ? (
                <div key={label} className="flex gap-3 text-xs">
                  <dt className="w-20 shrink-0 text-right text-zinc-400">{label}</dt>
                  <dd className="min-w-0 break-words text-zinc-700 dark:text-zinc-300">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
