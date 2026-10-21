import { prisma } from "@/lib/db";

/** Typed access to the AppSetting key-value store - user preferences that
 *  are not AI settings (undo window, inbox splits, follow-up cadence). */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value: value as object },
    create: { key, value: value as object },
  });
}

/** Seconds a send waits in the queue so it can be cancelled. 0 = off. */
export const getUndoSendSeconds = () => getSetting<number>("undoSendSeconds", 15);

/** Days before an unanswered thread raises a follow-up reminder. */
export const getFollowUpDays = () => getSetting<number>("followUpDays", 3);

/** Labels the user pinned as their own inbox sections; empty = defaults. */
export const getSplitLabels = () => getSetting<string[]>("inboxSplitLabels", []);

/** Request MDN read receipts on outgoing mail. */
export const getRequestReadReceipts = () => getSetting<boolean>("requestReadReceipts", false);

/** Follow-up automation: "off" reminds only, "draft" prepares a nudge,
 *  "send" queues it through the undo window. */
export const getAutoFollowUp = () => getSetting<string>("autoFollowUp", "off");

/** Remote avatar lookups (Gravatar + sender-domain favicons) — on by
 *  default so the list looks complete; the Settings toggle disables them
 *  for users who don't want sender addresses leaving the machine. */
export const getAvatarsEnabled = () => getSetting<boolean>("avatarsEnabled", true);

/** Remote images/CSS inside mail bodies — blocked by default so tracking
 *  pixels can't phone home; the Settings toggle loads them for every
 *  message without the per-message click. */
export const getLoadRemoteContent = () => getSetting<boolean>("loadRemoteContent", false);

/** Sender addresses trusted for remote content — images in their mail load
 *  automatically even when the global toggle is off. */
export const getTrustedRemoteSenders = () =>
  getSetting<string[]>("remoteContentSenders", []);

/** Off (default) = only important mail raises a notification — AI labels
 *  and bulk-mail heuristics filter newsletters/marketing out. On = every
 *  sync batch toasts, like the old behaviour. */
export const getNotifyAllMail = () => getSetting<boolean>("notifyAllMail", false);

/** Senders permanently dismissed from the reply queue — "no reply needed,
 *  always". Their threads never surface as needs-reply again until the
 *  user removes them in Settings. */
export const getNoReplySenders = () => getSetting<string[]>("noReplySenders", []);

/** Per-sender count of "just this once" reply-queue dismissals — the
 *  learning signal behind the "you've cleared N threads, always?" nudge. */
export const getNoReplyDismissals = () =>
  getSetting<Record<string, number>>("noReplyDismissals", {});
