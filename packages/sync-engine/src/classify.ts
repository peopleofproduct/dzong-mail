import { prisma } from "@unwalled/database";
import type { PrismaClient } from "@unwalled/database";
import { DEFAULT_AI_LABELS, resolveAIForAccount } from "./ai";

export { DEFAULT_AI_LABELS };

export interface ClassifyOutcome {
  accountId: string;
  classified: number;
  skipped: number;
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
    return { accountId, classified: 0, skipped: 0, reason: "AI disabled or unreachable" };
  }
  const { provider, candidateLabels } = ai;

  const pending = await db.message.findMany({
    where: { emailAccountId: accountId, aiLabels: { isEmpty: true }, isDraft: false },
    orderBy: { receivedAt: "desc" },
    take: options.limit ?? 25,
  });

  let classified = 0;
  for (const message of pending) {
    const text = [
      `Subject: ${message.subject ?? ""}`,
      `From: ${message.fromName ?? ""} <${message.fromAddress}>`,
      `Snippet: ${message.snippet ?? ""}`,
    ].join("\n");
    try {
      const { labels } = await provider.classify(text, candidateLabels);
      if (labels.length > 0) {
        await db.message.update({
          where: { id: message.id },
          data: { aiLabels: labels },
        });
      }
      classified++;
    } catch {
      // Leave the message unlabeled — a later pass can retry.
    }
  }

  return { accountId, classified, skipped: pending.length - classified };
}
