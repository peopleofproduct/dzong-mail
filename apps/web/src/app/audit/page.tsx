import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { UndoButton } from "./undo-button";

const ACTION_LABEL: Record<string, string> = {
  archive: "Archived",
  unarchive: "Unarchived",
  "move-trash": "Moved to trash",
  "move-archive": "Moved to archive",
  "move-inbox": "Moved to inbox",
  read: "Marked read",
  unread: "Marked unread",
  star: "Starred/unstarred",
  snooze: "Snoozed",
  unsnooze: "Unsnoozed",
  "rule-apply": "Rule applied",
  send: "Sent",
};

/**
 * Activity log: every mutation the app (or the worker) made, newest first.
 * Rows carrying an inverse payload render an Undo button - reversibility
 * is the privacy promise made concrete.
 */
async function AuditList() {
  await connection();
  const entries = await prisma.auditEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Activity log</h1>
          <p className="mt-0.5 text-xs text-zinc-400">
            Every action the app took on your mail - auditable and mostly reversible.
          </p>
        </div>
        <Link href="/" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
          ← Inbox
        </Link>
      </div>

      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {entries.map((e) => {
          const detail = e.detail as { inverse?: string; ids?: string[]; rule?: string } | null;
          const count = detail?.ids?.length;
          const reversible = detail?.inverse && detail.inverse !== "noop";
          return (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-32 shrink-0 text-xs text-zinc-400">
                {e.createdAt.toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <span className="min-w-0 flex-1 text-sm text-zinc-700 dark:text-zinc-300">
                {ACTION_LABEL[e.action] ?? e.action}
                {e.action === "rule-apply" && detail?.rule ? ` - ${detail.rule}` : ""}
                {count && count > 1 ? ` (${count} messages)` : ""}
              </span>
              {e.undoneAt ? (
                <span className="text-[11px] text-zinc-400">undone</span>
              ) : reversible ? (
                <UndoButton entryId={e.id} />
              ) : null}
            </li>
          );
        })}
        {entries.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-zinc-400">
            Nothing logged yet - actions you take will appear here.
          </li>
        )}
      </ul>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense>
      <AuditList />
    </Suspense>
  );
}
