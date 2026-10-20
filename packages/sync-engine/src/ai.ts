import { prisma } from "@dzong/database";
import type { AISettings, PrismaClient } from "@dzong/database";
import { resolveProvider } from "@dzong/ai-engine";
import type { AIProvider, AIProviderConfig } from "@dzong/ai-engine";
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

export interface ResolvedAI {
  provider: AIProvider;
  settings: AISettings;
  /** All candidate labels: built-ins plus the user's custom label names. */
  candidateLabels: string[];
}

/**
 * Resolve the user's configured AI provider. Returns null when AI is disabled,
 * unconfigured, or the endpoint is unreachable — callers treat AI features as
 * best-effort and degrade gracefully.
 */
export async function resolveAIForUser(
  userId: string,
  db: PrismaClient = prisma,
): Promise<ResolvedAI | null> {
  const settings = await db.aISettings.findUnique({ where: { userId } });
  if (!settings?.enabled) return null;

  const config: AIProviderConfig = {
    provider: settings.provider,
    baseUrl: settings.baseUrl ?? undefined,
    apiKey: decryptIfPresent(settings.apiKeyEncrypted),
    model: settings.model,
    embeddingModel: settings.embeddingModel ?? undefined,
    temperature: settings.temperature,
  };
  const provider = resolveProvider(config);
  if (!(await provider.healthCheck())) return null;

  const custom = (settings.customLabels as { name?: string }[] | null) ?? [];
  const candidateLabels = [
    ...DEFAULT_AI_LABELS,
    ...custom.map((c) => c.name).filter((n): n is string => Boolean(n)),
  ];

  return { provider, settings, candidateLabels };
}

/** Resolve AI from an account id — the common entry point for mail features. */
export async function resolveAIForAccount(
  accountId: string,
  db: PrismaClient = prisma,
): Promise<ResolvedAI | null> {
  const account = await db.emailAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { userId: true },
  });
  return resolveAIForUser(account.userId, db);
}
