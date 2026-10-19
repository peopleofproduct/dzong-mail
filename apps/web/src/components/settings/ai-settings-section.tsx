import { connection } from "next/server";
import { getLocalUser } from "@/lib/queries";
import { classifyNow, saveAISettings } from "@/lib/actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder-zinc-400 focus:border-indigo-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export async function AISettingsSection() {
  await connection();
  const user = await getLocalUser();
  const settings = user?.aiSettings;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          AI engine
        </h2>
        <form action={classifyNow.bind(null, undefined)}>
          <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
            Classify pending messages
          </button>
        </form>
      </div>

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
        BYOK providers; note Anthropic has no embeddings API, so semantic features need Ollama or
        OpenAI for embeddings.
      </p>
    </section>
  );
}
