import { prisma } from "@unwalled/database";
import type { EmailAccount, Message, PrismaClient } from "@unwalled/database";
import type { AIProvider } from "@unwalled/ai-engine";
import { resolveAIForAccount, resolveAIForUser } from "./ai";
import type { RuleAction, RuleCondition } from "./rules";

function threadContext(messages: Message[], maxMessages = 8, maxChars = 4000): string {
  const recent = messages.slice(-maxMessages);
  let out = "";
  for (const m of recent) {
    const body = (m.bodyText ?? m.snippet ?? "").slice(0, 1200);
    out += `---\nFrom: ${m.fromName ?? ""} <${m.fromAddress}>\nDate: ${m.receivedAt.toISOString()}\nSubject: ${m.subject ?? ""}\n\n${body}\n`;
  }
  return out.slice(0, maxChars);
}

/** The account holder's display name: explicit setting, then the From name
 *  they actually send as, then a prettified local part of the address. */
async function senderName(account: EmailAccount, db: PrismaClient): Promise<string> {
  if (account.displayName) return account.displayName;
  const sent = await db.message.findFirst({
    where: { emailAccountId: account.id, folder: "Sent", fromName: { not: null } },
    orderBy: { receivedAt: "desc" },
    select: { fromName: true },
  });
  if (sent?.fromName) return sent.fromName;
  const local = account.emailAddress.split("@")[0] ?? account.emailAddress;
  const pretty = local
    .replace(/[._-]+/g, " ")
    .replace(/\d+$/, "")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return pretty || account.emailAddress;
}

/** Small models still emit "[Your Name]"-style sign-offs sometimes — replace
 *  them with the resolved name so drafts never ship a placeholder. */
function fixSignoffPlaceholders(text: string, name: string): string {
  return text.replace(/\[(?:your|sender'?s?\s|my)?\s?name\]/gi, name);
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Create a draft Message row inside a thread (or standalone). */
export async function createDraftRow(
  db: PrismaClient,
  input: {
    emailAccountId: string;
    threadId?: string | null;
    subject: string;
    fromAddress: string;
    toAddresses: string[];
    bodyText: string;
    /** Tag the draft AI_DRAFT when a model wrote it (vs. a static template). */
    aiGenerated?: boolean;
  },
): Promise<Message> {
  return db.message.create({
    data: {
      emailAccountId: input.emailAccountId,
      providerMessageId: `draft-${crypto.randomUUID()}`,
      threadId: input.threadId ?? null,
      folder: "Drafts",
      subject: input.subject,
      snippet: input.bodyText.slice(0, 200),
      fromAddress: input.fromAddress,
      toAddresses: input.toAddresses,
      bodyText: input.bodyText,
      receivedAt: new Date(),
      isRead: true,
      isDraft: true,
      providerLabels: input.aiGenerated ? ["DRAFT", "AI_DRAFT"] : ["DRAFT"],
    },
  });
}

export interface DraftResult {
  ok: boolean;
  draftId?: string;
  reason?: string;
}

/**
 * Generate an AI reply draft for a message, threaded into its conversation.
 * The draft lands in the Drafts view for review — nothing is auto-sent.
 */
export async function draftAiReply(
  messageId: string,
  db: PrismaClient = prisma,
): Promise<DraftResult> {
  const message = await db.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { emailAccount: true },
  });
  const ai = await resolveAIForAccount(message.emailAccountId, db);
  if (!ai) return { ok: false, reason: "AI unavailable — enable AI in settings" };

  const thread = message.threadId
    ? await db.message.findMany({
        where: { threadId: message.threadId, isDraft: false },
        orderBy: { receivedAt: "asc" },
      })
    : [message];

  const name = await senderName(message.emailAccount, db);
  const response = await ai.provider.complete({
    messages: [
      {
        role: "system",
        content:
          "You are an email assistant drafting a reply on behalf of " +
          `${name} <${message.emailAccount.emailAddress}>. Write only the reply body — ` +
          "no subject line, no preamble like 'Here is a reply'. " +
          `If you sign off, sign off as ${name} — never use placeholders ` +
          "like '[Your Name]'. Match the sender's language, length, and " +
          "tone. Be concise.",
      },
      {
        role: "user",
        content: `Conversation so far:\n${threadContext(thread)}\n\nDraft a reply to the latest message.`,
      },
    ],
    maxTokens: 800,
    temperature: 0.4,
  });

  const draft = await createDraftRow(db, {
    emailAccountId: message.emailAccountId,
    threadId: message.threadId,
    subject: `Re: ${(message.subject ?? "").replace(/^Re:\s*/i, "")}`,
    fromAddress: message.emailAccount.emailAddress,
    toAddresses: [message.fromAddress],
    bodyText: fixSignoffPlaceholders(response.text.trim(), name),
    aiGenerated: true,
  });
  return { ok: true, draftId: draft.id };
}

/**
 * Summarize a thread into the latest message's `aiSummary` field.
 * Returns the summary text, or a reason string on failure.
 */
export async function summarizeThread(
  threadId: string,
  db: PrismaClient = prisma,
): Promise<{ ok: boolean; summary?: string; reason?: string }> {
  const messages = await db.message.findMany({
    where: { threadId, isDraft: false },
    orderBy: { receivedAt: "asc" },
    include: { emailAccount: { select: { userId: true } } },
  });
  if (messages.length === 0) return { ok: false, reason: "Thread not found" };

  const ai = await resolveAIForUser(messages[0].emailAccount.userId, db);
  if (!ai) return { ok: false, reason: "AI unavailable — enable AI in settings" };

  const response = await ai.provider.complete({
    messages: [
      {
        role: "system",
        content:
          "Summarize this email thread in 1-3 short sentences. Cover who is " +
          "involved, what was asked or decided, and any pending action. " +
          "Plain text only.",
      },
      { role: "user", content: threadContext(messages, 12, 6000) },
    ],
    maxTokens: 300,
    temperature: 0.2,
  });

  const summary = response.text.trim();
  const latest = messages[messages.length - 1];
  await db.message.update({ where: { id: latest.id }, data: { aiSummary: summary } });
  return { ok: true, summary };
}

export interface GeneratedRule {
  name: string;
  description?: string;
  matchMode: "ALL" | "ANY";
  conditions: RuleCondition[];
  actions: RuleAction[];
}

const DEFAULT_LABELS_HINT =
  "NEWSLETTER, MARKETING, COLD_PITCH, RECEIPT, NOTIFICATION, SOCIAL, ACTION_REQUIRED";

const RULE_GEN_SCHEMA = `Respond with ONLY a JSON object shaped like:
{
  "name": "short rule name",
  "description": "one sentence",
  "matchMode": "ALL" | "ANY",
  "conditions": [{"field": "from|to|subject|snippet|folder|aiLabel|providerLabel",
                  "operator": "contains|not_contains|equals|startsWith",
                  "value": "..."}],
  "actions": [{"type": "ARCHIVE|ADD_LABEL|MARK_READ|STAR|MOVE_FOLDER|DRAFT_REPLY|DELETE",
               "value": "label or folder name when relevant"}]
}
Use an "aiLabel" condition (value from: ${DEFAULT_LABELS_HINT}) when the intent
needs semantic classification; use static fields otherwise.`;

/**
 * Turn a plain-English instruction ("archive cold pitches", "star anything
 * from my accountant") into a rule definition via the user's AI provider.
 */
export async function generateRuleFromPrompt(
  userId: string,
  prompt: string,
  db: PrismaClient = prisma,
): Promise<{ ok: boolean; rule?: GeneratedRule; reason?: string }> {
  const ai = await resolveAIForUser(userId, db);
  if (!ai) return { ok: false, reason: "AI unavailable — enable AI in settings" };

  const response = await ai.provider.complete({
    messages: [
      {
        role: "system",
        content: `You convert email automation wishes into rule JSON. ${RULE_GEN_SCHEMA}`,
      },
      { role: "user", content: prompt },
    ],
    maxTokens: 500,
    temperature: 0.1,
  });

  try {
    const parsed = JSON.parse(stripCodeFences(response.text)) as GeneratedRule;
    if (!parsed.name || !Array.isArray(parsed.conditions) || !Array.isArray(parsed.actions)) {
      return { ok: false, reason: "AI returned malformed rule JSON" };
    }
    parsed.matchMode = parsed.matchMode === "ANY" ? "ANY" : "ALL";
    return { ok: true, rule: parsed };
  } catch {
    return { ok: false, reason: "Could not parse AI response as rule JSON" };
  }
}

/**
 * Freeform compose assistance: given to/subject/instructions, produce a body
 * draft. Used by the composer's "Write with AI" button.
 */
export async function composeWithAI(
  userId: string,
  input: { to?: string; subject?: string; instructions?: string; accountId?: string },
  db: PrismaClient = prisma,
): Promise<{ ok: boolean; body?: string; reason?: string }> {
  const ai = await resolveAIForUser(userId, db);
  if (!ai) return { ok: false, reason: "AI unavailable — enable AI in settings" };

  // Resolve a sign-off name from the chosen account, else the user's first.
  const account =
    (input.accountId
      ? await db.emailAccount.findUnique({ where: { id: input.accountId } })
      : null) ?? (await db.emailAccount.findFirst({ where: { userId } }));
  const name = account ? await senderName(account, db) : null;

  const response = await ai.provider.complete({
    messages: [
      {
        role: "system",
        content:
          "You are an email writing assistant. Output only the email body — " +
          "no subject, no commentary. Keep it natural and concise." +
          (name ? ` If you sign off, sign off as ${name} — never use placeholders.` : ""),
      },
      {
        role: "user",
        content:
          `To: ${input.to ?? "unspecified"}\nSubject: ${input.subject ?? "unspecified"}\n` +
          `Instructions: ${input.instructions?.trim() || "Write an appropriate email for this subject."}`,
      },
    ],
    maxTokens: 800,
    temperature: 0.5,
  });
  const body = name ? fixSignoffPlaceholders(response.text.trim(), name) : response.text.trim();
  return { ok: true, body };
}

export type { AIProvider };
