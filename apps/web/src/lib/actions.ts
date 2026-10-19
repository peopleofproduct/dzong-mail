"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  applyAutomationRules,
  buildGoogleAuthorizationUrl,
  buildMicrosoftAuthorizationUrl,
  classifyAccountMessages,
  encryptSecret,
  sendEmail,
  syncAccount,
  unsubscribeMessage,
} from "@unwalled/sync-engine";
import type { RuleAction, RuleCondition } from "@unwalled/sync-engine";
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

  await prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider: "IMAP_SMTP",
      emailAddress: get("emailAddress"),
      displayName: get("displayName") || null,
      imapHost: get("imapHost") || null,
      imapPort: Number.isFinite(imapPort) ? imapPort : 993,
      imapSecurity: (get("imapSecurity") || "SSL_TLS") as "SSL_TLS" | "STARTTLS" | "NONE",
      smtpHost: get("smtpHost") || null,
      smtpPort: Number.isFinite(smtpPort) ? smtpPort : null,
      username: get("username") || null,
      passwordEncrypted: password ? encryptSecret(password) : null,
    },
  });
  revalidatePath("/settings");
  safeRedirect("/settings", { notice: "Account connected" });
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

export async function removeAccount(accountId: string) {
  await prisma.emailAccount.delete({ where: { id: accountId } });
  revalidatePath("/settings");
  safeRedirect("/settings", { notice: "Account removed" });
}

// ─── Message operations ────────────────────────────────────────────────────

export async function toggleMessageFlag(messageId: string, flag: "isRead" | "isStarred") {
  const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  await prisma.message.update({
    where: { id: messageId },
    data: { [flag]: !message[flag] },
  });
  revalidatePath("/");
}

export async function archiveMessages(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.message.updateMany({
    where: { id: { in: ids } },
    data: { isArchived: true },
  });
  revalidatePath("/");
}

export async function unarchiveMessage(id: string) {
  await prisma.message.update({ where: { id }, data: { isArchived: false } });
  revalidatePath("/");
}

export async function markMessagesRead(ids: string[], read = true) {
  if (ids.length === 0) return;
  await prisma.message.updateMany({ where: { id: { in: ids } }, data: { isRead: read } });
  revalidatePath("/");
}

export async function snoozeMessage(id: string, hours: number) {
  const until = new Date(Date.now() + hours * 60 * 60 * 1000);
  await prisma.message.update({ where: { id }, data: { snoozedUntil: until } });
  revalidatePath("/");
}

export async function unsnoozeMessage(id: string) {
  await prisma.message.update({ where: { id }, data: { snoozedUntil: null } });
  revalidatePath("/");
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

export async function sendEmailAction(formData: FormData) {
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const accountId = get("accountId");
  const to = get("to")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!accountId || to.length === 0) {
    safeRedirect("/", { error: "Recipient and account are required" });
  }
  const scheduledAt = get("sendLater")
    ? new Date(Date.now() + Number(get("sendLater")) * 60 * 60 * 1000)
    : undefined;

  try {
    await sendEmail(accountId, {
      to,
      cc: get("cc")
        ? get("cc")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      subject: get("subject"),
      bodyText: get("body"),
      threadId: get("threadId") || undefined,
      inReplyToHeader: get("inReplyTo") || undefined,
      scheduledAt,
    });
  } catch (err) {
    safeRedirect("/", { error: String(err) });
  }
  revalidatePath("/");
  safeRedirect("/", { notice: scheduledAt ? "Send scheduled" : "Message sent" });
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
