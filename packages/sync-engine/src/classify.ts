import { prisma } from "@unwalled/database";
import type { PrismaClient } from "@unwalled/database";
import { DEFAULT_AI_LABELS, resolveAIForAccount } from "./ai";

export { DEFAULT_AI_LABELS };

export interface ClassifyOutcome {
  accountId: string;
  classified: number;
  skipped: number;
  /** Ids of messages that received at least one label this pass. */
  labeledIds: string[];
  reason?: string;
}

/**
 * Classify unlabeled messages on an account using the user's configured AI
 * provider (Ollama by default). Failures are swallowed — classification is a
 * best-effort post-sync step, never a sync blocker.
 */
export async function classifyAccountMessages(
  accountId: string,
  db: PrismaClient = prisma,
  options: { limit?: number } = {},
): Promise<ClassifyOutcome> {
  const ai = await resolveAIForAccount(accountId, db);
  if (!ai) {
    return {
      accountId,
      classified: 0,
      skipped: 0,
      labeledIds: [],
      reason: "AI disabled or unreachable",
    };
  }
  const { provider, candidateLabels } = ai;

  // Below this confidence a label decision is held for human review
  // instead of applied silently.
  const thresholdRow = await db.appSetting.findUnique({
    where: { key: "aiConfidenceThreshold" },
  });
  const threshold =
    typeof thresholdRow?.value === "number" ? thresholdRow.value : 0.65;

  const pending = await db.message.findMany({
    where: { emailAccountId: accountId, aiLabels: { isEmpty: true }, isDraft: false },
    orderBy: { receivedAt: "desc" },
    take: options.limit ?? 25,
  });

  let classified = 0;
  const labeledIds: string[] = [];
  for (const message of pending) {
    const text = [
      `Subject: ${message.subject ?? ""}`,
      `From: ${message.fromName ?? ""} <${message.fromAddress}>`,
      `Snippet: ${message.snippet ?? ""}`,
    ].join("\n");
    try {
      const { labels, confidence, reason } = await provider.classify(text, candidateLabels);
      if (labels.length > 0) {
        // Uncertain calls wait in the review queue; confident ones (and
        // providers that return no score at all) apply as before.
        const confident = confidence === undefined || confidence >= threshold;
        if (confident) {
          await db.message.update({
            where: { id: message.id },
            data: { aiLabels: labels },
          });
          labeledIds.push(message.id);
        }
        await db.aiDecision.create({
          data: {
            messageId: message.id,
            kind: "label",
            action: labels.join(","),
            reason,
            confidence,
            status: confident ? "applied" : "queued",
          },
        });
      }
      classified++;
    } catch {
      // Leave the message unlabeled — a later pass can retry.
    }
  }

  return { accountId, classified, skipped: pending.length - classified, labeledIds };
}
