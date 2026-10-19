import Link from "next/link";
import { Paperclip } from "lucide-react";
import { getThread } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { cleanEmailHtml } from "@/lib/email-html";
import { markMessagesRead, sendDraftNow, summarizeThreadNow } from "@/lib/actions";
import { AiDecisionCard } from "./ai-decision-card";
import { AiDraftButton } from "./ai-draft-button";
import { MarkReadOnMount } from "./mark-read-on-mount";
import { MessageBody } from "./message-body";
import { MessageDetails } from "./message-details";
import { SenderAvatar } from "./sender-avatar";
import { CollapsibleMessage } from "./collapsible-message";

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

/** Extract the transport facts Gmail shows in its "details" popover. */
function transportDetails(headers: Record<string, string> | null) {
  const h = headers ?? {};
  const domainOf = (v: string) => v.match(/@([A-Za-z0-9.-]+)/)?.[1];
  // Return-Path carries the bounce host (mailed-by); DKIM-Signature's d=
  // or Authentication-Results' header.d carries the signing domain.
  const mailedBy = h["Return-Path"] ? (domainOf(h["Return-Path"]) ?? null) : null;
  const signedBy =
    h["DKIM-Signature"]?.match(/\bd=([A-Za-z0-9.-]+)/i)?.[1] ??
    h["Authentication-Results"]?.match(/header\.d=([A-Za-z0-9.-]+)/i)?.[1] ??
    null;
  // The last Received hop notes TLS (e.g. "with ESMTPS ... version=TLS1_3").
  const security = /\bTLS[ _]?v?\d*\.?\d*/i.test(h["Received"] ?? "")
    ? "Standard encryption (TLS)"
    : null;
  return { mailedBy, signedBy, security };
}

/** Build compose params to reopen a draft for editing and sending. */
function draftParams(
  m: {
    id: string;
    emailAccountId: string;
    toAddresses: string[];
    ccAddresses: string[];
    bccAddresses: string[];
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
  if (m.ccAddresses.length) p.set("cc", m.ccAddresses.join(", "));
  if (m.bccAddresses.length) p.set("bcc", m.bccAddresses.join(", "));
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
          aiDecisions: { orderBy: { createdAt: "desc" }, take: 3 },
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

  // Calendar-aware planning: upcoming events involving any sender on this
  // thread - "you meet them Tuesday" context while replying.
  const senderSet = [...new Set(messages.map((m) => m.fromAddress.toLowerCase()))];
  const upcoming = await prisma.calendarEvent.findMany({
    where: {
      startsAt: { gt: new Date() },
      status: { not: "CANCELLED" },
      OR: [
        { organizer: { in: senderSet, mode: "insensitive" } },
        { attendees: { hasSome: senderSet } },
      ],
    },
    orderBy: { startsAt: "asc" },
    take: 20,
  });
  const nextEventFor = (addr: string) =>
    upcoming.find(
      (e) =>
        e.organizer?.toLowerCase() === addr ||
        e.attendees.some((a) => a.toLowerCase() === addr),
    );

  // Attachment dedupe: how many times each file's bytes appear anywhere
  // in the local store.
  const hashes = messages
    .flatMap((m) => m.attachments)
    .map((a) => a.contentHash)
    .filter((h): h is string => Boolean(h));
  const dupCounts = new Map<string, number>();
  if (hashes.length > 0) {
    const grouped = await prisma.attachment.groupBy({
      by: ["contentHash"],
      where: { contentHash: { in: hashes } },
      _count: true,
    });
    for (const g of grouped) {
      if (g.contentHash) dupCounts.set(g.contentHash, g._count);
    }
  }

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
        {messages.map((m, i) => (
          <CollapsibleMessage
            key={m.id}
            id={m.id}
            defaultOpen={i === messages.length - 1}
            summary={
              <span className="flex w-full min-w-0 items-center gap-2 px-5 py-3">
                <SenderAvatar email={m.fromAddress} name={m.fromName} size={24} />
                <span className="shrink-0 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {m.fromName ?? m.fromAddress}
                </span>
                {m.isDraft && (
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {m.providerLabels.includes("AI_DRAFT") ? "AI draft" : "Draft"}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-400 dark:text-zinc-500">
                  {m.snippet}
                </span>
                <span className="ml-auto shrink-0 text-xs text-zinc-400">
                  {m.receivedAt.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </span>
            }
            header={
              <span className="flex w-full items-center gap-2 px-5 pt-4 pb-2">
                <SenderAvatar email={m.fromAddress} name={m.fromName} size={36} />
                <a
                  href={`/senders/${encodeURIComponent(m.fromAddress)}`}
                  title="Relationship history"
                  className="text-sm font-medium text-zinc-900 hover:text-indigo-600 hover:underline dark:text-zinc-100 dark:hover:text-indigo-300"
                >
                  {m.fromName ?? m.fromAddress}
                </a>
                <span className="hidden text-xs text-zinc-400 sm:inline">
                  &lt;{m.fromAddress}&gt;
                </span>
                {(() => {
                  const ev = nextEventFor(m.fromAddress.toLowerCase());
                  return (
                    ev && (
                      <a
                        href="/calendar"
                        title={`${ev.summary ?? "Event"}${ev.location ? ` - ${ev.location}` : ""}`}
                        className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:hover:bg-violet-900"
                      >
                        Meets{" "}
                        {ev.startsAt.toLocaleDateString("en-US", {
                          weekday: "short",
                        })}{" "}
                        {ev.startsAt.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </a>
                    )
                  );
                })()}
                {m.isDraft && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    {m.providerLabels.includes("AI_DRAFT") ? "AI draft" : "Draft"}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-xs text-zinc-400">
                  {m.receivedAt.toLocaleString()}
                </span>
              </span>
            }
            body={
              <div className="px-5 pb-4">
                {(() => {
                  const me = m.emailAccount.emailAddress.toLowerCase();
                  const recipients = m.toAddresses.map((a) =>
                    a.toLowerCase() === me ? "me" : a,
                  );
                  const t = transportDetails(m.headers as Record<string, string> | null);
                  return (
                    <MessageDetails
                      to={recipients.join(", ") || "me"}
                      details={{
                        from: `${m.fromName ? `${m.fromName} ` : ""}<${m.fromAddress}>`,
                        to: m.toAddresses.join(", ") || me,
                        date: m.receivedAt.toLocaleString(),
                        subject: m.subject ?? "(no subject)",
                        openedAt: m.readAt ? m.readAt.toLocaleString() : null,
                        receiptRequested: m.receiptRequested,
                        ...t,
                      }}
                    />
                  );
                })()}
                {m.aiDecisions.map((d) => (
                  <AiDecisionCard key={d.id} decision={d} />
                ))}
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
                          a.storagePath
                            ? `Download ${a.filename}`
                            : `${a.filename} (not downloaded)`
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
                        {a.contentHash && (dupCounts.get(a.contentHash) ?? 0) > 1 && (
                          <span
                            title={`This exact file appears in ${dupCounts.get(a.contentHash)} messages`}
                            className="rounded bg-zinc-200 px-1 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                          >
                            ×{dupCounts.get(a.contentHash)}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                )}
                {m.isDraft && (
                  <div className="mt-3 flex items-center gap-2">
                    <Link
                      href={`/?${draftParams(m, baseParams)}`}
                      className="inline-block rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
                    >
                      Edit &amp; send draft →
                    </Link>
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
              </div>
            }
          />
        ))}
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <Link
          id="thread-reply"
          href={`/?${replyParams.toString()}`}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          ↩ Reply
        </Link>
        <Link
          id="thread-forward"
          href={`/?${fwdParams.toString()}`}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          ↪ Forward
        </Link>
        {!last.isDraft && (
          <AiDraftButton
            messageId={last.id}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          />
        )}
      </div>
    </div>
  );
}
