"use client";

import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { archiveSenderNow } from "@/lib/actions";
import type { DigestSender } from "@/lib/queries";

export function DigestList({ senders }: { senders: DigestSender[] }) {
  const router = useRouter();

  if (senders.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-zinc-400">
        No bulk or newsletter mail in the last 7 days — inbox is clean.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <p className="border-b border-zinc-100 px-4 py-2 text-[11px] font-medium tracking-wide text-zinc-400 uppercase dark:border-zinc-800">
        Bulk senders · last 7 days
      </p>
      <ul>
        {senders.map((s) => (
          <li
            key={s.fromAddress}
            className="group flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            onClick={() =>
              router.push(s.latestThreadId ? `/?thread=${s.latestThreadId}` : "/?view=digest")
            }
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[13px] font-medium text-zinc-800 dark:text-zinc-100">
                  {s.fromName ?? s.fromAddress}
                </span>
                <span className="shrink-0 rounded bg-zinc-100 px-1.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {s.count}×
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-zinc-400">
                  {new Date(s.latestReceivedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <p className="truncate text-xs text-zinc-400">{s.latestSubject}</p>
            </div>
            <button
              title={`Archive all mail from ${s.fromAddress}`}
              onClick={(e) => {
                e.stopPropagation();
                void archiveSenderNow(s.fromAddress);
              }}
              className="hidden shrink-0 rounded p-1 text-zinc-400 group-hover:block hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800"
            >
              <Archive size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
