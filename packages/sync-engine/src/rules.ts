import { prisma } from "@unwalled/database";
import type { AutomationRule, Message, PrismaClient, RuleTrigger } from "@unwalled/database";
import { createDraftRow, draftAiReply } from "./drafts";

export interface RuleCondition {
  field: "from" | "to" | "subject" | "snippet" | "aiLabel" | "providerLabel" | "folder";
  operator: "contains" | "not_contains" | "equals" | "startsWith";
  value: string;
}

export type RuleActionType =
  "ARCHIVE" | "ADD_LABEL" | "MARK_READ" | "STAR" | "MOVE_FOLDER" | "DRAFT_REPLY" | "DELETE";

export interface RuleAction {
  type: RuleActionType;
  /** Target label for ADD_LABEL, folder for MOVE_FOLDER. */
  value?: string;
  /** Body template for DRAFT_REPLY — supports {{from_name}} / {{subject}}. */
  template?: string;
}

export interface RuleEvalResult {
  ruleId: string;
  ruleName: string;
  matched: number;
  applied: number;
  errors: string[];
}

export function parseConditions(json: unknown): RuleCondition[] {
  return Array.isArray(json) ? (json as RuleCondition[]) : [];
}

export function parseActions(json: unknown): RuleAction[] {
  return Array.isArray(json) ? (json as RuleAction[]) : [];
}

function fieldValue(message: Message, field: RuleCondition["field"]): string {
  switch (field) {
    case "from":
      return `${message.fromName ?? ""} <${message.fromAddress}>`;
    case "to":
      return message.toAddresses.join(", ");
    case "subject":
      return message.subject ?? "";
    case "snippet":
      return message.snippet ?? "";
    case "folder":
      return message.folder ?? "";
    case "aiLabel":
      return message.aiLabels.join(" ");
    case "providerLabel":
      return message.providerLabels.join(" ");
  }
}

export function matchesCondition(message: Message, cond: RuleCondition): boolean {
  const haystack = fieldValue(message, cond.field).toLowerCase();
  const needle = cond.value.toLowerCase();
  switch (cond.operator) {
    case "contains":
      return haystack.includes(needle);
    case "not_contains":
      return !haystack.includes(needle);
    case "equals":
      return haystack === needle;
    case "startsWith":
      return haystack.startsWith(needle);
  }
}

export function matchesRule(rule: AutomationRule, message: Message): boolean {
  const conditions = parseConditions(rule.conditions);
  if (conditions.length === 0) return false;
  return rule.matchMode === "ANY"
    ? conditions.some((c) => matchesCondition(message, c))
    : conditions.every((c) => matchesCondition(message, c));
}

async function applyAction(
  db: PrismaClient,
  accountEmail: string,
  message: Message,
  action: RuleAction,
): Promise<void> {
  switch (action.type) {
    case "ARCHIVE":
      await db.message.update({
        where: { id: message.id },
        data: { isArchived: true, folder: "Archive" },
      });
      break;
    case "ADD_LABEL":
      if (action.value && !message.labels.includes(action.value)) {
        await db.message.update({
          where: { id: message.id },
          data: { labels: { push: action.value } },
        });
      }
      break;
    case "MARK_READ":
      await db.message.update({ where: { id: message.id }, data: { isRead: true } });
      break;
    case "STAR":
      await db.message.update({ where: { id: message.id }, data: { isStarred: true } });
      break;
    case "MOVE_FOLDER":
      if (action.value) {
        await db.message.update({ where: { id: message.id }, data: { folder: action.value } });
      }
      break;
    case "DELETE":
      await db.message.delete({ where: { id: message.id } });
      break;
    case "DRAFT_REPLY":
      if (!action.template) {
        // No template → generate the reply with the user's AI provider.
        const result = await draftAiReply(message.id, db);
        if (!result.ok) {
          throw new Error(result.reason ?? "AI draft failed");
        }
        break;
      }
      await createDraftRow(db, {
        emailAccountId: message.emailAccountId,
        threadId: message.threadId,
        subject: `Re: ${message.subject ?? ""}`,
        fromAddress: accountEmail,
        toAddresses: [message.fromAddress],
        bodyText: action.template
          .replaceAll("{{from_name}}", message.fromName ?? message.fromAddress)
          .replaceAll("{{subject}}", message.subject ?? ""),
      });
      break;
  }
}

/**
 * Evaluate a user's enabled rules (ordered by priority) against unprocessed
 * messages on the account, apply their actions, and stamp lastRunAt.
 */
export async function applyAutomationRules(
  accountId: string,
  db: PrismaClient = prisma,
  options: { messageIds?: string[]; dryRun?: boolean; trigger?: RuleTrigger } = {},
): Promise<RuleEvalResult[]> {
  const account = await db.emailAccount.findUniqueOrThrow({
    where: { id: accountId },
    include: { user: true },
  });

  const rules = await db.automationRule.findMany({
    where: {
      userId: account.userId,
      isEnabled: true,
      OR: [{ emailAccountId: accountId }, { emailAccountId: null }],
      ...(options.trigger ? { trigger: options.trigger } : {}),
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  if (rules.length === 0) return [];

  const messages = await db.message.findMany({
    where: {
      emailAccountId: accountId,
      isArchived: false,
      isDraft: false,
      ...(options.messageIds ? { id: { in: options.messageIds } } : {}),
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });

  const results: RuleEvalResult[] = [];
  for (const rule of rules) {
    const result: RuleEvalResult = {
      ruleId: rule.id,
      ruleName: rule.name,
      matched: 0,
      applied: 0,
      errors: [],
    };
    const actions = parseActions(rule.actions);
    for (const message of messages) {
      if (!matchesRule(rule, message)) continue;
      result.matched++;
      if (options.dryRun) continue;
      try {
        for (const action of actions) {
          await applyAction(db, account.emailAddress, message, action);
        }
        result.applied++;
      } catch (err) {
        result.errors.push(`${message.id}: ${String(err)}`);
      }
    }
    await db.automationRule.update({
      where: { id: rule.id },
      data: { lastRunAt: new Date() },
    });
    results.push(result);
  }
  return results;
}
