import { getAccounts } from "@/lib/queries";
import { resolveAIForUser } from "@dzong/sync-engine";

/**
 * Shown when no AI provider is reachable — points non-technical users at the
 * guided AI settings section instead of leaving AI features silently dead.
 */
export async function AiSetupBanner() {
  const accounts = await getAccounts();
  const userId = accounts[0]?.userId;
  if (!userId) return null;
  if (await resolveAIForUser(userId)) return null;

  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
      <span>✦ AI features are off — no provider reachable.</span>
      <a
        href="/settings"
        className="font-medium underline hover:text-amber-900 dark:hover:text-amber-200"
      >
        Set up Ollama (free, private) or add an API key →
      </a>
    </div>
  );
}
