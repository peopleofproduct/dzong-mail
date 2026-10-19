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
