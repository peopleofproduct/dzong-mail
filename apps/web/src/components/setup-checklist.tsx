import Link from "next/link";
import { connection } from "next/server";
import { CheckCircle2, Circle, Download } from "lucide-react";
import { prisma } from "@/lib/db";
import { getAccounts, getLocalUser } from "@/lib/queries";
import { startOllamaPull } from "@/lib/actions";
import { OLLAMA_DEFAULT_BASE_URL } from "@dzong/ai-engine";

interface Check {
  label: string;
  done: boolean;
  hint?: string;
  action?: { href: string; text: string } | { model: string };
}

async function ollamaModels(base: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${base}/api/tags`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: { name?: string; model?: string }[] };
    return (data.models ?? []).map((m) => m.name ?? m.model ?? "").filter(Boolean);
  } catch {
    return null;
  }
}

/** First-run checklist - turns "is anything missing?" into visible steps. */
export async function SetupChecklist() {
  await connection();
  const [accounts, user, embedded] = await Promise.all([
    getAccounts(),
    getLocalUser(),
    prisma.message.count({ where: { embedding: { isEmpty: false } } }),
  ]);

  const ai = user?.aiSettings;
  const provider = ai?.provider ?? "OLLAMA";
  const ollamaBase = ai?.baseUrl ?? OLLAMA_DEFAULT_BASE_URL;
  const ollamaUp = provider === "OLLAMA" || provider === "ANTHROPIC";
  const tags = ollamaUp ? await ollamaModels(ollamaBase) : null;

  const chatReady =
    provider === "OLLAMA"
      ? Boolean(tags?.some((m) => m.startsWith((ai?.model ?? "llama3.1").split(":")[0])))
      : Boolean(ai?.apiKeyEncrypted);
  const embedModel = ai?.embeddingModel ?? "nomic-embed-text";
  const embedReady =
    provider === "OPENAI"
      ? Boolean(ai?.apiKeyEncrypted)
      : Boolean(tags?.some((m) => m.startsWith(embedModel.split(":")[0])));

  const checks: Check[] = [
    {
      label: "Connect a mail account",
      done: accounts.some((a) => a.provider !== "MOCK"),
      action: { href: "/settings", text: "Connect one" },
    },
    {
      label: "Enable the AI engine",
      done: Boolean(ai?.enabled),
      action: { href: "/settings", text: "Open AI settings" },
    },
    {
      label: provider === "OLLAMA" ? `Chat model (${ai?.model ?? "llama3.1"})` : "AI provider key",
      done: chatReady,
      hint:
        tags === null && ollamaUp ? "Ollama isn't running - start it, then recheck." : undefined,
      action:
        provider === "OLLAMA" && tags !== null
          ? { model: ai?.model ?? "llama3.1" }
          : provider === "OLLAMA"
            ? undefined
            : { href: "/settings", text: "Add your key" },
    },
    {
      label: `Search index model (${embedModel})`,
      done: embedReady,
      hint:
        tags === null && ollamaUp ? "Ollama isn't running - start it, then recheck." : undefined,
      action: ollamaUp && tags !== null && !embedReady ? { model: embedModel } : undefined,
    },
    {
      label: "Index your inbox",
      done: embedded > 0,
      hint: "Runs automatically in the worker - first pass takes a few minutes.",
    },
  ];

  const remaining = checks.filter((c) => !c.done).length;

  return (
    <div className="mt-10 rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        First-run checklist
        <span className="ml-2 text-xs font-normal text-zinc-400">
          {remaining === 0 ? "all set" : `${remaining} to go`}
        </span>
      </h2>
      <ul className="mt-3 flex flex-col gap-2.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2.5 text-sm">
            {c.done ? (
              <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
            ) : (
              <Circle size={15} className="shrink-0 text-zinc-300 dark:text-zinc-600" />
            )}
            <span
              className={c.done ? "text-zinc-400 line-through" : "text-zinc-700 dark:text-zinc-200"}
            >
              {c.label}
            </span>
            {!c.done && c.hint && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">{c.hint}</span>
            )}
            {!c.done && c.action && "href" in c.action && (
              <Link
                href={c.action.href}
                className="text-[11px] font-medium text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
              >
                {c.action.text}
              </Link>
            )}
            {!c.done && c.action && "model" in c.action && (
              <form action={startOllamaPull.bind(null, c.action.model)}>
                <button className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  <Download size={11} /> Pull now
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
