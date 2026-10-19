import { getThread } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { markMessagesRead } from "@/lib/actions";
import { MarkReadOnMount } from "./mark-read-on-mount";

interface ThreadPanelProps {
  threadId: string;
  /** Query string to preserve when building the reply link. */
  baseParams: string;
}

export async function ThreadPanel({ threadId, baseParams }: ThreadPanelProps) {
  const messages = threadId.startsWith("single-")
    ? await prisma.message.findMany({
        where: { id: threadId.slice(7) },
        include: { emailAccount: { select: { emailAddress: true } } },
      })
    : await getThread(threadId);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Thread not found.
      </div>
    );
  }

  const unread = messages.filter((m) => !m.isRead).map((m) => m.id);
  const first = messages[0];
  const last = messages[messages.length - 1];

  const replyParams = new URLSearchParams(baseParams);
  replyParams.set("compose", "reply");
  replyParams.set("accountId", last.emailAccountId);
  replyParams.set("to", last.fromAddress);
  replyParams.set("subject", `Re: ${(last.subject ?? "").replace(/^Re:\s*/i, "")}`);
  if (last.threadId) replyParams.set("threadId", last.threadId);
  const inReplyTo = (last.headers as Record<string, string> | null)?.["Message-ID"];
  if (inReplyTo) replyParams.set("inReplyTo", inReplyTo);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {unread.length > 0 && <MarkReadOnMount ids={unread} action={markMessagesRead} />}

      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {first.subject ?? "(no subject)"}
        </h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          {messages.length} message{messages.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="flex flex-1 flex-col divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {messages.map((m) => (
          <article key={m.id} className="px-5 py-4" id={m.id}>
            <header className="mb-2 flex items-baseline gap-2">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {m.fromName ?? m.fromAddress}
              </span>
              <span className="text-xs text-zinc-400">&lt;{m.fromAddress}&gt;</span>
              <span className="ml-auto text-xs text-zinc-400">{m.receivedAt.toLocaleString()}</span>
            </header>
            <p className="mb-3 text-xs text-zinc-400">to {m.toAddresses.join(", ") || "me"}</p>
            {m.bodyText ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                {m.bodyText}
              </p>
            ) : (
              <p className="text-sm text-zinc-500 italic">{m.snippet ?? "No content synced."}</p>
            )}
          </article>
        ))}
      </div>

      <div className="sticky bottom-0 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <a
          href={`/?${replyParams.toString()}`}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          ↩ Reply
        </a>
      </div>
    </div>
  );
}
