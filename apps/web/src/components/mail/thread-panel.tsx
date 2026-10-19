import { Paperclip } from "lucide-react";
import { getThread } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { cleanEmailHtml } from "@/lib/email-html";
import { draftAiReplyNow, markMessagesRead, sendDraftNow, summarizeThreadNow } from "@/lib/actions";
import { MarkReadOnMount } from "./mark-read-on-mount";
import { MessageBody } from "./message-body";
import { SenderAvatar } from "./sender-avatar";

interface ThreadPanelProps {
  threadId: string;
  /** Query string to preserve when building the reply link. */
  baseParams: string;
}

/** Map inline-attachment Content-IDs to attachment ids so cid: images in
 *  the body resolve to the locally stored file. */
function cidMapFor(attachments: { id: string; contentId: string | null; storagePath: string | null }[]) {
  const map = new Map<string, string>();
  for (const a of attachments) {
    if (a.contentId && a.storagePath) map.set(a.contentId.replace(/[<>]/g, "").trim(), a.id);
  }
  return map;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Build compose params to reopen a draft for editing and sending. */
function draftParams(
  m: {
    id: string;
    emailAccountId: string;
    toAddresses: string[];
    subject: string | null;
    bodyText: string | null;
    threadId: string | null;
  },
  baseParams: string,
): string {
  const p = new URLSearchParams(baseParams);
  p.set("compose", "draft");
  p.set("draftId", m.id);
  p.set("accountId", m.emailAccountId);
  p.set("to", m.toAddresses.join(", "));
  p.set("subject", m.subject ?? "");
  if (m.bodyText) p.set("body", m.bodyText);
  if (m.threadId) p.set("threadId", m.threadId);
  return p.toString();
}

export async function ThreadPanel({ threadId, baseParams }: ThreadPanelProps) {
  const messages = threadId.startsWith("single-")
    ? await prisma.message.findMany({
        where: { id: threadId.slice(7) },
        include: {
          emailAccount: { select: { emailAddress: true } },
          attachments: { orderBy: { createdAt: "asc" } },
        },
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

  const fwdParams = new URLSearchParams(baseParams);
  fwdParams.set("compose", "new");
  fwdParams.set("accountId", last.emailAccountId);
  fwdParams.set("subject", `Fwd: ${(last.subject ?? "").replace(/^Fwd?:\s*/i, "")}`);
  fwdParams.set(
    "body",
    `\n\n---------- Forwarded message ---------\nFrom: ${last.fromName ?? ""} <${last.fromAddress}>\n` +
      `Date: ${last.receivedAt.toLocaleString()}\nSubject: ${last.subject ?? ""}\n\n` +
      (last.bodyText ?? last.snippet ?? ""),
  );

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {unread.length > 0 && <MarkReadOnMount ids={unread} action={markMessagesRead} />}

      <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {first.subject ?? "(no subject)"}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {messages.length} message{messages.length === 1 ? "" : "s"}
            </p>
          </div>
          {last.threadId && (
            <form action={summarizeThreadNow.bind(null, last.threadId)}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                ✦ Summarize
              </button>
            </form>
          )}
        </div>
        {(() => {
          const summary = [...messages].reverse().find((m) => m.aiSummary)?.aiSummary;
          return (
            summary && (
              <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs leading-relaxed text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-200">
                <span className="mr-1.5 font-semibold">✦ AI summary</span>
                {summary}
              </div>
            )
          );
        })()}
      </div>

      <div className="flex flex-1 flex-col divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {messages.map((m) => (
          <article key={m.id} className="px-5 py-4" id={m.id}>
            <header className="mb-2 flex items-center gap-2">
              <SenderAvatar email={m.fromAddress} name={m.fromName} size={36} />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {m.fromName ?? m.fromAddress}
              </span>
              <span className="text-xs text-zinc-400">&lt;{m.fromAddress}&gt;</span>
              {m.isDraft && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  {m.providerLabels.includes("AI_DRAFT") ? "AI draft" : "Draft"}
                </span>
              )}
              <span className="ml-auto text-xs text-zinc-400">{m.receivedAt.toLocaleString()}</span>
            </header>
            <p className="mb-3 text-xs text-zinc-400">to {m.toAddresses.join(", ") || "me"}</p>
            <MessageBody
              html={m.bodyHtml ? cleanEmailHtml(m.bodyHtml, cidMapFor(m.attachments)) : null}
              text={m.bodyText}
              fallback={m.snippet ?? "No content synced."}
            />
            {m.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.storagePath ? `/api/attachments/${a.id}` : undefined}
                    title={
                      a.storagePath ? `Download ${a.filename}` : `${a.filename} (not downloaded)`
                    }
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                      a.storagePath
                        ? "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        : "cursor-default border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700"
                    }`}
                  >
                    <Paperclip size={12} />
                    <span className="max-w-48 truncate">{a.filename}</span>
                    {a.sizeBytes !== null && a.sizeBytes !== undefined && (
                      <span className="text-zinc-400">{formatBytes(a.sizeBytes)}</span>
                    )}
                  </a>
                ))}
              </div>
            )}
            {m.isDraft && (
              <div className="mt-3 flex items-center gap-2">
                <a
                  href={`/?${draftParams(m, baseParams)}`}
                  className="inline-block rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
                >
                  Edit &amp; send draft →
                </a>
                <form action={sendDraftNow.bind(null, m.id)}>
                  <button
                    type="submit"
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                  >
                    Send now
                  </button>
                </form>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <a
          id="thread-reply"
          href={`/?${replyParams.toString()}`}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          ↩ Reply
        </a>
        <a
          id="thread-forward"
          href={`/?${fwdParams.toString()}`}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          ↪ Forward
        </a>
        {!last.isDraft && (
          <form action={draftAiReplyNow.bind(null, last.id)}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            >
              ✦ Draft reply with AI
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
