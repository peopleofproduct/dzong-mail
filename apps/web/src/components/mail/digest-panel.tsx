import Link from "next/link";
import { Newspaper, Sparkles } from "lucide-react";
import { generateDigest } from "@unwalled/sync-engine";
import { getLocalUser } from "@/lib/queries";

export async function DigestPanel({ generated }: { generated: boolean }) {
  const user = await getLocalUser();
  const result = generated && user ? await generateDigest(user.id) : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          <Newspaper size={15} className="text-indigo-500" />
          Digest
        </h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          A rollup of the last 7 days of bulk mail — generated locally by your AI.
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {result?.ok && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/30">
            <p className="mt-0 text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">
              {result.answer}
            </p>
          </div>
        )}

        {result && !result.ok && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            {result.reason ?? "Could not generate the digest — is AI enabled in Settings?"}
          </p>
        )}

        {result?.ok && result.sources && result.sources.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">
              Included mail
            </p>
            <div className="space-y-1.5">
              {result.sources.map((hit) => (
                <Link
                  key={hit.message.id}
                  href={`/?thread=${hit.message.threadId ?? hit.message.id}`}
                  className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:border-indigo-300 hover:bg-white dark:border-zinc-800 dark:hover:border-indigo-800 dark:hover:bg-zinc-900"
                >
                  <span className="truncate text-zinc-700 dark:text-zinc-200">
                    {hit.message.subject ?? "(no subject)"}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-zinc-400">
                    {hit.message.fromName ?? hit.message.fromAddress}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!generated && (
          <div className="pt-6 text-center text-sm text-zinc-400">
            <p>Your bulk mail from the last week, condensed into a few lines.</p>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <form action="/" method="get">
          <input type="hidden" name="view" value="digest" />
          <input type="hidden" name="digestgen" value="1" />
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            <Sparkles size={14} />
            {generated ? "Regenerate digest" : "Generate AI digest"}
          </button>
        </form>
      </div>
    </div>
  );
}
