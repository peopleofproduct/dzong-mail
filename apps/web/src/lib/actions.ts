"use server";

import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getLocalUser } from "@/lib/queries";
import {
  applyAutomationRules,
  buildGoogleAuthorizationUrl,
  buildMicrosoftAuthorizationUrl,
  classifyAccountMessages,
  composeVariantsWithAI,
  dispatchScheduledDraft,
  draftAiReply,
  encryptSecret,
  generateReplyVariants,
  generateRuleFromPrompt,
  saveReplyDraft,
  sendEmail,
  createDraftRow,
  summarizeThread,
  syncAccount,
  unsubscribeMessage,
  unsubscribeSender,
  importMailFiles,
  verifyAccount,
} from "@unwalled/sync-engine";
import type { GeneratedRule, RuleAction, RuleCondition, SendAttachment } from "@unwalled/sync-engine";
import { attachmentFilePath, attachmentsDir, storeAttachmentContent } from "@unwalled/sync-engine";
import { snapshotInboxZero } from "@/lib/achievements";
import { getRequestReadReceipts, getUndoSendSeconds, setSetting } from "@/lib/settings";
import type { Prisma } from "@unwalled/database";

const DEMO_USER_EMAIL = "me@unwalled.local";

async function getOrCreateLocalUser() {
  return prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: { email: DEMO_USER_EMAIL, name: "Local User" },
  });
}

function safeRedirect(path: string, params: Record<string, string> = {}): never {
  const qs = new URLSearchParams(params);
  redirect(qs.size ? `${path}?${qs}` : path);
}

// ─── Accounts ──────────────────────────────────────────────────────────────

async function redirectUriFor(provider: "google" | "microsoft"): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}/api/oauth/${provider}/callback`;
}

export async function connectMockAccount() {
  const user = await getOrCreateLocalUser();
  const account = await prisma.emailAccount.upsert({
    where: {
      userId_emailAddress: { userId: user.id, emailAddress: "demo@unwalled.local" },
    },
    update: {},
    create: {
      userId: user.id,
      provider: "MOCK",
      emailAddress: "demo@unwalled.local",
      displayName: "Demo Inbox",
    },
  });
  try {
    await syncAccount(account.id);
  } catch (err) {
    safeRedirect("/", { error: String(err) });
  }
  revalidatePath("/");
}

export async function connectImapAccount(formData: FormData) {
  const user = await getOrCreateLocalUser();
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const imapPort = Number.parseInt(get("imapPort"), 10);
  const smtpPort = Number.parseInt(get("smtpPort"), 10);
  const password = get("password");
  const emailAddress = get("emailAddress");

  const connection = {
    provider: "IMAP_SMTP" as const,
    displayName: get("displayName") || null,
    imapHost: get("imapHost") || null,
    imapPort: Number.isFinite(imapPort) ? imapPort : 993,
    imapSecurity: (get("imapSecurity") || "SSL_TLS") as "SSL_TLS" | "STARTTLS" | "NONE",
    smtpHost: get("smtpHost") || null,
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : null,
    smtpSecurity: (get("smtpSecurity") || null) as "SSL_TLS" | "STARTTLS" | "NONE" | null,
    username: get("username") || emailAddress,
  };

  // Re-connecting an address the user already added updates its credentials
  // (rotated app password etc.) rather than crashing on the unique key.
  const existing = await prisma.emailAccount.findUnique({
    where: { userId_emailAddress: { userId: user.id, emailAddress } },
    select: { id: true },
  });
  await prisma.emailAccount.upsert({
    where: { userId_emailAddress: { userId: user.id, emailAddress } },
    update: { ...connection, ...(password ? { passwordEncrypted: encryptSecret(password) } : {}) },
    create: {
      userId: user.id,
      emailAddress,
      ...connection,
      passwordEncrypted: password ? encryptSecret(password) : null,
    },
  });
  revalidatePath("/settings");
  safeRedirect("/settings", {
    notice: existing ? "Account credentials updated" : "Account connected",
  });
}

export async function connectOAuthAccount(formData: FormData) {
  const user = await getOrCreateLocalUser();
  const provider = String(formData.get("provider"));
  if (provider !== "GOOGLE" && provider !== "MICROSOFT") {
    safeRedirect("/settings", { error: "Unknown OAuth provider" });
  }
  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();
  if (!clientId || !clientSecret) {
    safeRedirect("/settings", { error: "Client ID and secret are required" });
  }

  const account = await prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider,
      emailAddress: `${provider.toLowerCase()}-${Date.now()}@pending.local`,
      oauthClientId: clientId,
      oauthClientSecret: encryptSecret(clientSecret),
    },
  });

  const config = {
    clientId,
    redirectUri: await redirectUriFor(provider.toLowerCase() as "google" | "microsoft"),
  };
  const url =
    provider === "GOOGLE"
      ? buildGoogleAuthorizationUrl(config, account.id)
      : buildMicrosoftAuthorizationUrl(config, account.id);
  redirect(url);
}

export async function syncAccountNow(accountId: string) {
  try {
    await syncAccount(accountId);
  } catch (err) {
    safeRedirect("/settings", { error: String(err) });
  }
  revalidatePath("/");
}

export async function syncAllNow() {
  const accounts = await prisma.emailAccount.findMany({
    where: { syncEnabled: true, isActive: true },
    select: { id: true },
  });
  for (const { id } of accounts) {
    try {
      await syncAccount(id);
    } catch {
      // Keep going — other accounts may still succeed.
    }
  }
  revalidatePath("/");
}

export async function updateAccountDisplayName(formData: FormData) {
  const accountId = String(formData.get("accountId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  if (!accountId) return;
  await prisma.emailAccount.update({ where: { id: accountId }, data: { displayName } });
  revalidatePath("/settings");
}

export async function removeAccount(accountId: string) {
  // Collect messages with attachment dirs before the cascade delete so the
  // files on disk are removed too — otherwise they orphan forever.
  const attachmentDirs = (
    await prisma.message.findMany({
      where: { emailAccountId: accountId, hasAttachment: true },
      select: { id: true },
    })
  ).map((m) => m.id);

  await prisma.emailAccount.delete({ where: { id: accountId } });

  const { rm } = await import("node:fs/promises");
  const { attachmentsDir } = await import("@unwalled/sync-engine");
  await Promise.allSettled(
    attachmentDirs.map((id) => rm(join(attachmentsDir(), id), { recursive: true, force: true })),
  );

  revalidatePath("/settings");
  safeRedirect("/settings", { notice: "Account removed" });
}

// ─── Message operations ────────────────────────────────────────────────────

/** Write a reversible-action record. `detail.inverse` names the inverse
 *  mutation consumed by undoAuditEntry; `detail.ids` carries the rows. */
async function audit(
  action: string,
  targetId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await prisma.auditEntry
    .create({
      data: {
        action,
        targetType: "message",
        targetId,
        detail: detail as Prisma.InputJsonValue,
      },
    })
    .catch(() => null); // auditing never blocks the mutation itself
}

export async function toggleMessageFlag(messageId: string, flag: "isRead" | "isStarred") {
  const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  await prisma.message.update({
    where: { id: messageId },
    data: {
      [flag]: !message[flag],
      // Stamp the first-open time for the local read receipt.
      ...(flag === "isRead" && !message.isRead && !message.readAt
        ? { readAt: new Date() }
        : {}),
    },
  });
  await audit(flag === "isStarred" ? "star" : "read", messageId, {
    inverse: "toggle-flag",
    flag,
    ids: [messageId],
  });
  revalidatePath("/");
}

export async function archiveMessages(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.message.updateMany({
    where: { id: { in: ids } },
    data: { isArchived: true },
  });
  await audit("archive", ids[0], { inverse: "unarchive", ids });
  await snapshotInboxZero();
  revalidatePath("/");
}

/** Dismiss a whole thread from the reply queue — archives every synced
 *  message in it (drafts survive so nothing written is lost). */
export async function archiveThreadNow(threadId: string) {
  await prisma.message.updateMany({
    where: { threadId, isDraft: false },
    data: { isArchived: true },
  });
  await snapshotInboxZero();
  revalidatePath("/");
}

export async function unarchiveMessage(id: string) {
  await prisma.message.update({ where: { id }, data: { isArchived: false } });
  revalidatePath("/");
}

export async function unarchiveMessages(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.message.updateMany({ where: { id: { in: ids } }, data: { isArchived: false } });
  await audit("unarchive", ids[0], { inverse: "archive", ids });
  revalidatePath("/");
}

/** Move-to keyboard chord: archive back to inbox, or tag a folder. */
export async function moveMessages(ids: string[], target: "inbox" | "archive" | "trash") {
  if (ids.length === 0) return;
  if (target === "inbox") {
    await prisma.message.updateMany({
      where: { id: { in: ids } },
      data: { isArchived: false, folder: "INBOX" },
    });
  } else if (target === "archive") {
    await prisma.message.updateMany({
      where: { id: { in: ids } },
      data: { isArchived: true },
    });
  } else {
    await prisma.message.updateMany({
      where: { id: { in: ids } },
      data: { isArchived: true, folder: "Trash" },
    });
  }
  await audit(`move-${target}`, ids[0], {
    inverse: target === "trash" ? "restore" : target === "archive" ? "unarchive" : "archive",
    ids,
  });
  await snapshotInboxZero();
  revalidatePath("/");
}

export async function markMessagesRead(ids: string[], read = true) {
  if (ids.length === 0) return;
  // First open stamps readAt; unread clears neither flag nor the record.
  await prisma.message.updateMany({
    where: { id: { in: ids }, readAt: null },
    data: { isRead: read, readAt: read ? new Date() : null },
  });
  await prisma.message.updateMany({
    where: { id: { in: ids }, readAt: { not: null } },
    data: { isRead: read },
  });
  await audit(read ? "read" : "unread", ids[0], {
    inverse: read ? "mark-unread" : "mark-read",
    ids,
  });
  revalidatePath("/");
}

export async function snoozeMessage(id: string, hours: number) {
  const until = new Date(Date.now() + hours * 60 * 60 * 1000);
  await prisma.message.update({ where: { id }, data: { snoozedUntil: until } });
  await audit("snooze", id, { inverse: "unsnooze", ids: [id] });
  revalidatePath("/");
}

export async function unsnoozeMessage(id: string) {
  await prisma.message.update({ where: { id }, data: { snoozedUntil: null } });
  await audit("unsnooze", id, { inverse: "noop", ids: [id] });
  revalidatePath("/");
}

/** Archive everything currently unarchived from one sender (digest cleanup). */
export async function archiveSenderNow(fromAddress: string) {
  await prisma.message.updateMany({
    where: { fromAddress, isArchived: false, isDraft: false },
    data: { isArchived: true },
  });
  revalidatePath("/");
}

/** Send a draft immediately through its account's real provider. */
export async function sendDraftNow(messageId: string) {
  const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  if (!message.isDraft || message.toAddresses.length === 0) {
    safeRedirect("/", { error: "Draft has no recipient" });
  }
  try {
    await dispatchScheduledDraft(messageId);
    safeRedirect("/", { notice: "Draft sent" });
  } catch (err) {
    safeRedirect("/", { error: String(err) });
  }
}

export async function unsubscribeFromMessage(id: string) {
  const result = await unsubscribeMessage(id);
  if (!result.ok && result.method !== "https-link" && result.method !== "mailto") {
    safeRedirect("/", { error: `Unsubscribe failed: ${result.note ?? "no target"}` });
  }
  if (result.method === "https-link" || result.method === "mailto") {
    redirect(result.target!);
  }
  revalidatePath("/");
}

// ─── Composing ─────────────────────────────────────────────────────────────

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Collect uploaded files from the composer form into SendAttachments. */
async function formAttachments(formData: FormData): Promise<SendAttachment[]> {
  const files = formData.getAll("attachments");
  const out: SendAttachment[] = [];
  let total = 0;
  for (const f of files) {
    if (!(f instanceof File) || f.size === 0) continue;
    total += f.size;
    if (total > MAX_ATTACHMENT_BYTES) {
      throw new Error("Attachments exceed the 20 MB limit");
    }
    out.push({
      filename: f.name,
      contentType: f.type || "application/octet-stream",
      content: Buffer.from(await f.arrayBuffer()),
    });
  }
  return out;
}

/** Files stored on a draft row, reloaded for sending. */
async function storedDraftAttachments(draftId: string): Promise<SendAttachment[]> {
  const rows = await prisma.attachment.findMany({ where: { messageId: draftId } });
  const out: SendAttachment[] = [];
  for (const a of rows) {
    if (!a.storagePath) continue;
    try {
      out.push({
        filename: a.filename,
        contentType: a.mimeType ?? "application/octet-stream",
        content: await readFile(attachmentFilePath(a.storagePath)),
      });
    } catch {
      // File missing on disk - skip rather than block the send.
    }
  }
  return out;
}

/** Remove a draft row and any files it stored locally. */
async function deleteDraftWithFiles(draftId: string) {
  await prisma.message.delete({ where: { id: draftId } }).catch(() => {});
  await rm(join(attachmentsDir(), draftId), { recursive: true, force: true }).catch(() => {});
}

const splitAddresses = (raw: string) =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export async function sendEmailAction(formData: FormData) {
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const accountId = get("accountId");
  const to = splitAddresses(get("to"));
  if (!accountId || to.length === 0) {
    safeRedirect("/", { error: "Recipient and account are required" });
  }
  const explicitLater = get("sendLater")
    ? new Date(Date.now() + Number(get("sendLater")) * 60 * 60 * 1000)
    : undefined;
  // Undo-send: every send queues through a short window first. Setting the
  // window to 0 restores instant sends.
  const undoSeconds = await getUndoSendSeconds();
  const scheduledAt = explicitLater ??
    (undoSeconds > 0 ? new Date(Date.now() + undoSeconds * 1000) : undefined);

  const draftId = get("draftId");
  let rowId: string | undefined;
  try {
    const uploads = await formAttachments(formData);
    const stored = draftId ? await storedDraftAttachments(draftId) : [];
    const result = await sendEmail(accountId, {
      to,
      cc: splitAddresses(get("cc")),
      bcc: splitAddresses(get("bcc")),
      subject: get("subject"),
      bodyText: get("body"),
      bodyHtml: get("bodyHtml") || undefined,
      attachments: [...uploads, ...stored],
      threadId: get("threadId") || undefined,
      inReplyToHeader: get("inReplyTo") || undefined,
      scheduledAt,
      requestReceipt: await getRequestReadReceipts(),
    });
    rowId = result.messageRowId;
  } catch (err) {
    safeRedirect("/", { error: String(err) });
  }
  // If this send originated from an existing draft row, consume it.
  if (draftId) await deleteDraftWithFiles(draftId);
  revalidatePath("/");
  if (explicitLater) safeRedirect("/", { notice: "Send scheduled" });
  if (scheduledAt && rowId) {
    safeRedirect("/", { undo: rowId });
  }
  safeRedirect("/", { notice: "Message sent" });
}

/** Cancel a queued send inside the undo window — the message drops back to
 *  Drafts untouched, like Gmail's Undo. */
export async function cancelScheduledSend(messageId: string): Promise<{ ok: boolean }> {
  await prisma.message.updateMany({
    where: { id: messageId, isDraft: true, scheduledAt: { not: null } },
    data: { scheduledAt: null },
  });
  revalidatePath("/");
  return { ok: true };
}

/** Skip the wait — dispatch a queued send right now. */
export async function dispatchQueuedSend(messageId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    await dispatchScheduledDraft(messageId);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

/**
 * Persist the composer's current state as a draft when the window closes.
 * Returns the draft id so a repeat close updates rather than duplicates.
 * Called from the client - never redirects.
 */
export async function saveComposerDraft(formData: FormData): Promise<{
  ok: boolean;
  saved?: boolean;
  draftId?: string;
  reason?: string;
}> {
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const accountId = get("accountId");
  if (!accountId) return { ok: false, reason: "No account" };
  const to = splitAddresses(get("to"));
  const cc = splitAddresses(get("cc"));
  const bcc = splitAddresses(get("bcc"));
  const subject = get("subject");
  const body = get("body");
  const uploads = await formAttachments(formData).catch(() => [] as SendAttachment[]);

  if (to.length === 0 && !subject && !body && uploads.length === 0) {
    return { ok: true, saved: false };
  }

  try {
    const account = await prisma.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
    const draftId = get("draftId");
    let row;
    if (draftId) {
      row = await prisma.message.update({
        where: { id: draftId },
        data: {
          toAddresses: to,
          ccAddresses: cc,
          bccAddresses: bcc,
          subject: subject || null,
          bodyText: body,
          bodyHtml: get("bodyHtml") || null,
          snippet: body.slice(0, 200),
          hasAttachment: uploads.length > 0,
        },
      });
    } else {
      row = await createDraftRow(prisma, {
        emailAccountId: accountId,
        threadId: get("threadId") || null,
        subject,
        fromAddress: account.emailAddress,
        toAddresses: to,
        ccAddresses: cc,
        bccAddresses: bcc,
        bodyText: body,
        bodyHtml: get("bodyHtml") || undefined,
      });
    }

    // New uploads replace nothing - they append to whatever the draft has.
    for (const a of uploads) {
      const storagePath = await storeAttachmentContent(row.id, {
        filename: a.filename,
        mimeType: a.contentType,
        content: a.content,
      });
      await prisma.attachment.create({
        data: {
          messageId: row.id,
          filename: a.filename,
          mimeType: a.contentType,
          sizeBytes: a.content.length,
          storagePath,
        },
      });
    }
    if (uploads.length > 0 && draftId) {
      await prisma.message.update({ where: { id: row.id }, data: { hasAttachment: true } });
    }

    revalidatePath("/");
    return { ok: true, saved: true, draftId: row.id };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

/** Trash button in the composer - discards the draft without saving. */
export async function discardComposerDraft(draftId: string | null): Promise<{ ok: boolean }> {
  if (draftId) await deleteDraftWithFiles(draftId);
  revalidatePath("/");
  return { ok: true };
}

/** Remove a single stored attachment from a draft being edited. */
export async function removeDraftAttachment(attachmentId: string): Promise<{ ok: boolean }> {
  const row = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (row) {
    await prisma.attachment.delete({ where: { id: attachmentId } });
    if (row.storagePath) {
      await rm(attachmentFilePath(row.storagePath), { force: true }).catch(() => {});
    }
  }
  revalidatePath("/");
  return { ok: true };
}

/** Welcome checklist: kick off an Ollama model pull in the background. */
export async function startOllamaPull(model: string) {
  const user = await getLocalUser();
  const base = user?.aiSettings?.baseUrl ?? "http://localhost:11434";
  // Fire and forget - Ollama streams progress; the checklist flips green
  // on the next page load once the model lands.
  void fetch(`${base}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, stream: false }),
  }).catch(() => null);
  revalidatePath("/welcome");
}

/** Remove a scheduled assistant routine (Settings → Routines). */
export async function deleteRoutineNow(id: string) {
  const { deleteRoutine } = await import("@unwalled/sync-engine");
  await deleteRoutine(id);
  revalidatePath("/settings");
}

// ─── AI features ────────────────────────────────────────────────────────────

export async function draftAiReplyNow(messageId: string) {
  const result = await draftAiReply(messageId);
  revalidatePath("/");
  safeRedirect("/", result.ok ? { notice: "Draft ready in Drafts" } : { error: result.reason! });
}

/** Meeting-brief CTA: AI-draft replies to everything a sender is still owed. */
export async function draftOwedRepliesNow(fromAddress: string) {
  const owed = await prisma.message.findMany({
    where: {
      fromAddress: { equals: fromAddress, mode: "insensitive" },
      isRead: false,
      isDraft: false,
      aiLabels: { has: "NEEDS_REPLY" },
    },
    orderBy: { receivedAt: "asc" },
    take: 3,
    select: { id: true },
  });
  let drafted = 0;
  for (const m of owed) {
    const res = await draftAiReply(m.id).catch(() => ({ ok: false as const }));
    if (res.ok) drafted++;
  }
  revalidatePath("/");
  safeRedirect(
    "/?view=drafts",
    drafted > 0
      ? { notice: `${drafted} reply draft${drafted === 1 ? "" : "s"} ready` }
      : { error: "No drafts could be generated" },
  );
}

/** Generate reply variants for the picker — returns bodies, persists nothing. */
export async function generateReplyVariantsNow(
  messageId: string,
): Promise<{ ok: boolean; variants?: { key: string; body: string }[]; reason?: string }> {
  return generateReplyVariants(messageId);
}

/** Persist the variant the user picked as a thread draft. */
export async function saveReplyDraftNow(
  messageId: string,
  body: string,
): Promise<{ ok: boolean; reason?: string }> {
  const result = await saveReplyDraft(messageId, body);
  revalidatePath("/");
  return result.ok ? { ok: true } : { ok: false, reason: result.reason ?? "Could not save draft" };
}

export async function summarizeThreadNow(threadId: string) {
  const result = await summarizeThread(threadId);
  revalidatePath("/");
  if (!result.ok) safeRedirect("/", { error: result.reason! });
}

export async function generateRuleJson(
  prompt: string,
): Promise<{ ok: true; rule: GeneratedRule } | { ok: false; reason: string }> {
  const user = await getOrCreateLocalUser();
  const result = await generateRuleFromPrompt(user.id, prompt);
  if (result.ok && result.rule) return { ok: true, rule: result.rule };
  return { ok: false, reason: result.reason ?? "Generation failed" };
}

/** Three styled compose variants for the composer's "Write with AI" picker. */
export async function generateComposeVariantsNow(input: {
  to?: string;
  subject?: string;
  instructions?: string;
  accountId?: string;
}): Promise<{ ok: boolean; variants?: { key: string; body: string }[]; reason?: string }> {
  const user = await getOrCreateLocalUser();
  return composeVariantsWithAI(user.id, input);
}

export async function unsubscribeSenderNow(fromAddress: string) {
  const result = await unsubscribeSender(fromAddress);
  revalidatePath("/");
  revalidatePath("/settings");
  if (result.method === "https-link" || result.method === "mailto") {
    redirect(result.target!);
  }
  safeRedirect(
    "/settings",
    result.ok
      ? { notice: `Unsubscribed — archived ${result.archived} message(s)` }
      : { error: `Unsubscribe failed: ${result.note ?? "no target"}` },
  );
}

export async function createColdEmailPreset() {
  const user = await getOrCreateLocalUser();
  await prisma.automationRule.upsert({
    where: { id: "preset-cold-email" },
    update: {},
    create: {
      id: "preset-cold-email",
      userId: user.id,
      name: "Cold email blocker",
      description: "AI-flagged cold pitches are labelled and archived out of the inbox.",
      trigger: "ON_AI_CLASSIFICATION",
      matchMode: "ALL",
      conditions: [{ field: "aiLabel", operator: "contains", value: "COLD_PITCH" }],
      actions: [{ type: "ADD_LABEL", value: "COLD_EMAIL" }, { type: "ARCHIVE" }],
    },
  });
  revalidatePath("/settings");
  safeRedirect("/settings", { notice: "Cold email blocker rule created — enable AI to use it" });
}

// ─── Automation rules ──────────────────────────────────────────────────────

export async function saveRule(formData: FormData) {
  const user = await getOrCreateLocalUser();
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const ruleId = get("ruleId");

  const conditions: RuleCondition[] = JSON.parse(get("conditions") || "[]");
  const actions: RuleAction[] = JSON.parse(get("actions") || "[]");
  const emailAccountId = get("emailAccountId") || null;

  const data = {
    name: get("name"),
    description: get("description") || null,
    isEnabled: get("isEnabled") !== "off",
    priority: Number.parseInt(get("priority"), 10) || 0,
    trigger: (get("trigger") || "ON_MESSAGE_SYNC") as
      "ON_MESSAGE_SYNC" | "ON_AI_CLASSIFICATION" | "MANUAL",
    matchMode: (get("matchMode") || "ALL") as "ALL" | "ANY",
    conditions: conditions as unknown as Prisma.InputJsonValue,
    actions: actions as unknown as Prisma.InputJsonValue,
    emailAccountId,
    // Auto-send routes rule drafts through the undo window, so "auto" still
    // means recallable for the configured delay.
    autoSendDrafts: get("autoSend") === "on",
  };

  if (ruleId) {
    await prisma.automationRule.update({ where: { id: ruleId }, data });
  } else {
    await prisma.automationRule.create({ data: { ...data, userId: user.id } });
  }
  revalidatePath("/settings");
  safeRedirect("/settings", { notice: "Rule saved" });
}

export async function deleteRule(ruleId: string) {
  await prisma.automationRule.delete({ where: { id: ruleId } });
  revalidatePath("/settings");
}

export async function runRulesNow(accountId?: string, dryRun = false) {
  const ids = accountId
    ? [accountId]
    : (await prisma.emailAccount.findMany({ select: { id: true } })).map((a) => a.id);
  const results = [];
  for (const id of ids) {
    results.push(...(await applyAutomationRules(id, prisma, { dryRun })));
  }
  if (dryRun) {
    const matched = results.reduce((n, r) => n + r.matched, 0);
    safeRedirect("/settings", { notice: `Dry run: ${matched} message(s) would match` });
  }
  revalidatePath("/");
  safeRedirect("/settings", { notice: `Rules applied to ${ids.length} account(s)` });
}

// ─── AI settings & classification ─────────────────────────────────────────

export async function saveAISettings(formData: FormData) {
  const user = await getOrCreateLocalUser();
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const apiKey = get("apiKey");

  let customLabels: Prisma.InputJsonValue = [];
  try {
    customLabels = JSON.parse(get("customLabels") || "[]") as Prisma.InputJsonValue;
  } catch {
    safeRedirect("/settings", { error: "Custom labels must be valid JSON" });
  }

  await prisma.aISettings.upsert({
    where: { userId: user.id },
    update: {
      provider: get("provider") as "OLLAMA" | "OPENAI" | "ANTHROPIC",
      baseUrl: get("baseUrl") || null,
      model: get("model") || "llama3.1",
      embeddingModel: get("embeddingModel") || null,
      temperature: Number.parseFloat(get("temperature")) || 0.2,
      enabled: get("enabled") === "on",
      customLabels,
      ...(apiKey ? { apiKeyEncrypted: encryptSecret(apiKey) } : {}),
    },
    create: {
      userId: user.id,
      provider: get("provider") as "OLLAMA" | "OPENAI" | "ANTHROPIC",
      baseUrl: get("baseUrl") || null,
      model: get("model") || "llama3.1",
      embeddingModel: get("embeddingModel") || null,
      temperature: Number.parseFloat(get("temperature")) || 0.2,
      enabled: get("enabled") === "on",
      customLabels,
      apiKeyEncrypted: apiKey ? encryptSecret(apiKey) : null,
    },
  });
  revalidatePath("/settings");
  safeRedirect("/settings", { notice: "AI settings saved" });
}

export async function classifyNow(accountId?: string) {
  const ids = accountId
    ? [accountId]
    : (await prisma.emailAccount.findMany({ select: { id: true } })).map((a) => a.id);
  let classified = 0;
  let reason: string | undefined;
  for (const id of ids) {
    const r = await classifyAccountMessages(id);
    classified += r.classified;
    reason ??= r.reason;
  }
  revalidatePath("/");
  safeRedirect("/settings", {
    notice:
      classified > 0
        ? `Classified ${classified} message(s)`
        : `Nothing classified — ${reason ?? "no pending messages"}`,
  });
}

// ─── Preferences (AppSetting) ────────────────────────────────────────────────

export async function savePrefs(formData: FormData) {
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  await setSetting("undoSendSeconds", Math.max(0, Number(get("undoSendSeconds")) || 0));
  await setSetting("followUpDays", Math.max(1, Number(get("followUpDays")) || 3));
  const autoFollowUp = get("autoFollowUp");
  await setSetting(
    "autoFollowUp",
    autoFollowUp === "draft" || autoFollowUp === "send" ? autoFollowUp : "off",
  );
  await setSetting("requestReadReceipts", get("requestReadReceipts") === "on");
  // 0-100 in the UI, stored as the 0-1 fraction the classifier compares.
  const thresholdPct = Number(get("aiConfidenceThreshold")) || 65;
  await setSetting(
    "aiConfidenceThreshold",
    Math.min(100, Math.max(0, thresholdPct)) / 100,
  );
  // Density rides in a cookie (not AppSetting) so the layout-init script can
  // apply it before first paint without making the root layout dynamic.
  const cookieStore = await cookies();
  const density = get("density") === "compact" ? "compact" : "comfortable";
  cookieStore.set("unwalled-density", density, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/settings");
  safeRedirect("/settings", { notice: "Preferences saved" });
}

/** Pin/unpin labels as custom inbox sections. */
export async function saveSplitLabels(formData: FormData) {
  const labels = formData.getAll("splitLabel").map(String).filter(Boolean);
  await setSetting("inboxSplitLabels", labels);
  revalidatePath("/settings");
  revalidatePath("/");
  safeRedirect("/settings", { notice: labels.length ? "Inbox sections saved" : "Back to default sections" });
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  await prisma.notification.updateMany({
    where: { readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}

// ─── Snippets ─────────────────────────────────────────────────────────────────

export async function saveSnippet(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const id = String(formData.get("snippetId") ?? "").trim();
  if (!name || !body) safeRedirect("/settings", { error: "Snippet needs a name and body" });
  if (id) {
    await prisma.snippet.update({ where: { id }, data: { name, body } });
  } else {
    await prisma.snippet.create({ data: { name, body } });
  }
  revalidatePath("/settings");
  safeRedirect("/settings", { notice: "Snippet saved" });
}

export async function deleteSnippet(id: string) {
  await prisma.snippet.delete({ where: { id } });
  revalidatePath("/settings");
}

// ─── Tasks (calendar to-dos) ─────────────────────────────────────────────────

export async function saveTask(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const dueAt = String(formData.get("dueAt") ?? "").trim();
  if (!title) return;
  await prisma.task.create({
    data: {
      title,
      notes: String(formData.get("notes") ?? "").trim() || null,
      dueAt: dueAt ? new Date(dueAt) : null,
    },
  });
  revalidatePath("/calendar");
}

export async function toggleTask(id: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id } });
  await prisma.task.update({
    where: { id },
    data: { doneAt: task.doneAt ? null : new Date() },
  });
  revalidatePath("/calendar");
}

export async function deleteTask(id: string) {
  await prisma.task.delete({ where: { id } });
  revalidatePath("/calendar");
}

// ─── Import (.eml / .mbox) ────────────────────────────────────────────────────

const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export async function importMailAction(formData: FormData) {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) safeRedirect("/settings", { error: "Choose .eml or .mbox files" });
  let total = 0;
  const inputs: { name: string; data: Buffer }[] = [];
  for (const f of files) {
    total += f.size;
    if (total > MAX_IMPORT_BYTES) {
      safeRedirect("/settings", { error: "Import exceeds the 100 MB limit" });
    }
    inputs.push({ name: f.name, data: Buffer.from(await f.arrayBuffer()) });
  }
  const result = await importMailFiles(inputs);
  revalidatePath("/");
  safeRedirect("/settings", {
    notice: `Imported ${result.imported} message(s)${result.skipped ? `, skipped ${result.skipped}` : ""}`,
  });
}

// ─── Provider verification ───────────────────────────────────────────────────

export async function verifyAccountNow(accountId: string) {
  const result = await verifyAccount(accountId);
  safeRedirect("/settings", {
    [result.ok ? "notice" : "error"]: `${result.emailAddress}: ${result.detail}`,
  });
}

// ─── AI decision review + action audit ───────────────────────────────────────

/** Approve a queued AI decision (apply its labels) or reject it. */
export async function reviewDecision(decisionId: string, approve: boolean) {
  const decision = await prisma.aiDecision.findUniqueOrThrow({
    where: { id: decisionId },
  });
  if (decision.status !== "queued") return;
  if (approve && decision.kind === "label") {
    const labels = decision.action.split(",").filter(Boolean);
    await prisma.message.update({
      where: { id: decision.messageId },
      data: { aiLabels: { push: labels } },
    });
  }
  await prisma.aiDecision.update({
    where: { id: decisionId },
    data: { status: approve ? "applied" : "rejected" },
  });
  revalidatePath("/");
}

/** Reverse a logged mutation using the inverse recorded in detail. */
export async function undoAuditEntry(entryId: string): Promise<{ ok: boolean }> {
  const entry = await prisma.auditEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.undoneAt) return { ok: false };
  const detail = entry.detail as {
    inverse?: string;
    ids?: string[];
    flag?: string;
    label?: string;
  } | null;
  const ids = detail?.ids ?? (entry.targetType === "message" ? [entry.targetId] : []);
  if (!detail?.inverse || detail.inverse === "noop" || ids.length === 0) return { ok: false };

  switch (detail.inverse) {
    case "unarchive":
      await prisma.message.updateMany({ where: { id: { in: ids } }, data: { isArchived: false } });
      break;
    case "archive":
      await prisma.message.updateMany({ where: { id: { in: ids } }, data: { isArchived: true } });
      break;
    case "restore":
      await prisma.message.updateMany({
        where: { id: { in: ids } },
        data: { isArchived: false, folder: "INBOX" },
      });
      break;
    case "mark-unread":
      await prisma.message.updateMany({ where: { id: { in: ids } }, data: { isRead: false } });
      break;
    case "mark-read":
      await prisma.message.updateMany({ where: { id: { in: ids } }, data: { isRead: true } });
      break;
    case "unsnooze":
      await prisma.message.updateMany({ where: { id: { in: ids } }, data: { snoozedUntil: null } });
      break;
    case "label":
    case "unlabel": {
      const name = detail.label;
      if (!name) return { ok: false };
      const rows = await prisma.message.findMany({
        where: { id: { in: ids } },
        select: { id: true, labels: true },
      });
      for (const row of rows) {
        const next =
          detail.inverse === "label"
            ? row.labels.includes(name)
              ? row.labels
              : [...row.labels, name]
            : row.labels.filter((l) => l !== name);
        await prisma.message.update({ where: { id: row.id }, data: { labels: next } });
      }
      break;
    }
    case "delete-drafts":
      await prisma.message.deleteMany({ where: { id: { in: ids }, isDraft: true } });
      break;
    case "unschedule": {
      const { deleteRoutine } = await import("@unwalled/sync-engine");
      for (const id of ids) await deleteRoutine(id);
      break;
    }
    case "toggle-flag": {
      const flag = detail.flag === "isStarred" ? "isStarred" : "isRead";
      const rows = await prisma.message.findMany({ where: { id: { in: ids } } });
      for (const row of rows) {
        await prisma.message.update({
          where: { id: row.id },
          data: { [flag]: !row[flag] },
        });
      }
      break;
    }
    default:
      return { ok: false };
  }
  await prisma.auditEntry.update({ where: { id: entryId }, data: { undoneAt: new Date() } });
  await snapshotInboxZero();
  revalidatePath("/");
  revalidatePath("/audit");
  return { ok: true };
}
