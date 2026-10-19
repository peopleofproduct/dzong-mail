import { prisma } from "@unwalled/database";
import type { PrismaClient } from "@unwalled/database";
import { resolveProvider } from "@unwalled/ai-engine";
import type { AIProviderConfig } from "@unwalled/ai-engine";
import { decryptIfPresent } from "./crypto";

export const DEFAULT_AI_LABELS = [
  "NEWSLETTER",
  "MARKETING",
  "COLD_PITCH",
  "RECEIPT",
  "NOTIFICATION",
  "SOCIAL",
  "ACTION_REQUIRED",
] as const;

interface CustomLabelDef {
  name: string;
  prompt?: string;
}

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
  const account = await db.emailAccount.findUniqueOrThrow({
    where: { id: accountId },
    include: { user: { include: { aiSettings: true } } },
  });

  const settings = account.user.aiSettings;
  if (!settings?.enabled) {
    return { accountId, classified: 0, skipped: 0, reason: "AI disabled" };
  }

  const config: AIProviderConfig = {
    provider: settings.provider,
    baseUrl: settings.baseUrl ?? undefined,
    apiKey: decryptIfPresent(settings.apiKeyEncrypted),
    model: settings.model,
    embeddingModel: settings.embeddingModel ?? undefined,
    temperature: settings.temperature,
  };
  const provider = resolveProvider(config);

  if (!(await provider.healthCheck())) {
    return { accountId, classified: 0, skipped: 0, reason: "Provider unreachable" };
  }

  const custom = (settings.customLabels as CustomLabelDef[] | null) ?? [];
  const candidates = [...DEFAULT_AI_LABELS, ...custom.map((c) => c.name).filter(Boolean)];

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
      const { labels } = await provider.classify(text, candidates);
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
