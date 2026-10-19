import { connection } from "next/server";
import { getLocalUser } from "@/lib/queries";
import { resolveAIForUser } from "@unwalled/sync-engine";
import { classifyNow, saveAISettings } from "@/lib/actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder-zinc-400 focus:border-indigo-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export async function AISettingsSection() {
  await connection();
  const user = await getLocalUser();
  const settings = user?.aiSettings;
  const aiReady = user ? Boolean(await resolveAIForUser(user.id)) : false;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          AI engine
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium normal-case ${
              aiReady
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
            }`}
          >
            {aiReady ? "connected" : "not reachable"}
          </span>
        </h2>
        <form action={classifyNow.bind(null, undefined)}>
          <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
            Classify pending messages
          </button>
        </form>
      </div>

      <details className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/30">
        <summary className="cursor-pointer text-sm font-medium text-indigo-900 dark:text-indigo-200">
          New to local AI? Two-step setup with Ollama (free &amp; private)
        </summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
          <li>
            Install Ollama from{" "}
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 underline dark:text-indigo-400"
            >
              ollama.com/download
            </a>{" "}
            (or{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">brew install ollama</code>)
            and start it.
          </li>
          <li>
            Pull a model:{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
              ollama pull llama3.2:3b
            </code>{" "}
            and{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
              ollama pull nomic-embed-text
            </code>
          </li>
          <li>
            Keep the defaults below — Ollama runs at{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">localhost:11434</code> —
            then Save. Nothing ever leaves your machine.
          </li>
        </ol>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Rather use a cloud model? Pick OpenAI or Anthropic in the form and paste your own API key
          — your mail goes only to the provider you choose.
        </p>
      </details>

      <form
        action={saveAISettings}
        className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <select
          name="provider"
          defaultValue={settings?.provider ?? "OLLAMA"}
          className={inputClass}
        >
          <option value="OLLAMA">Ollama (local)</option>
          <option value="OPENAI">OpenAI (BYOK)</option>
          <option value="ANTHROPIC">Anthropic (BYOK)</option>
        </select>
        <input
          name="model"
          placeholder="Model (e.g. llama3.2:3b, gpt-4o-mini, claude-sonnet-4-5)"
          defaultValue={settings?.model ?? "llama3.1"}
          className={inputClass}
        />
        <input
          name="baseUrl"
          placeholder="Base URL (e.g. http://localhost:11434)"
          defaultValue={settings?.baseUrl ?? ""}
          className={inputClass}
        />
        <input
          name="embeddingModel"
          placeholder="Embedding model (optional)"
          defaultValue={settings?.embeddingModel ?? ""}
          className={inputClass}
        />
        <input
          name="apiKey"
          type="password"
          placeholder={
            settings?.apiKeyEncrypted ? "API key (stored — enter to replace)" : "API key"
          }
          className={inputClass}
        />
        <input
          name="temperature"
          type="number"
          step="0.1"
          min="0"
          max="2"
          placeholder="Temperature"
          defaultValue={settings?.temperature ?? 0.2}
          className={inputClass}
        />
        <textarea
          name="customLabels"
          rows={3}
          placeholder='[{"name":"RECEIPTS","prompt":"Invoices, receipts, or bills"}]'
          defaultValue={
            settings?.customLabels ? JSON.stringify(settings.customLabels, null, 2) : ""
          }
          className={`${inputClass} col-span-2 font-mono text-xs`}
        />
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={settings?.enabled ?? true}
            className="accent-indigo-600"
          />
          AI features enabled
        </label>
        <button className="justify-self-end rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500">
          Save AI settings
        </button>
      </form>
      <p className="text-xs text-zinc-400">
        Keys stay on this machine — AES-256-GCM encrypted with your local UNWALLED_SECRET_KEY. With
        Ollama selected, no data leaves localhost. OpenAI and Anthropic are supported as optional
        BYOK providers. Anthropic can't index your mail, so when it's selected we quietly use your
        local Ollama for search and answers — everything still stays on this machine. If no local
        model is running, the assistant falls back to plain keyword matching.
      </p>
    </section>
  );
}
