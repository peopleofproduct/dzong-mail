"use client";

import { useTransition } from "react";
import { Undo2 } from "lucide-react";
import { undoAuditEntry } from "@/lib/actions";

export function UndoButton({ entryId }: { entryId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await undoAuditEntry(entryId)))}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
    >
      <Undo2 size={11} /> Undo
    </button>
  );
}
