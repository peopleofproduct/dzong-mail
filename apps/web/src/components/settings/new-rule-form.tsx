"use client";

import { useState, useTransition } from "react";
import { generateRuleJson, saveRule } from "@/lib/actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder-zinc-400 focus:border-indigo-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const CONDITION_FIELDS = ["from", "to", "subject", "snippet", "folder", "aiLabel", "providerLabel"];
const OPERATORS = ["contains", "not_contains", "equals", "startsWith"];
const ACTION_TYPES = [
  "ARCHIVE",
  "ADD_LABEL",
  "MARK_READ",
  "STAR",
  "MOVE_FOLDER",
  "DRAFT_REPLY",
  "WEBHOOK",
  "DELETE",
];

interface AccountOption {
  id: string;
  emailAddress: string;
}

export function NewRuleForm({ accounts }: { accounts: AccountOption[] }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [matchMode, setMatchMode] = useState("ALL");
  const [conditions, setConditions] = useState(
    '[{"field":"subject","operator":"contains","value":""}]',
  );
  const [actions, setActions] = useState('[{"type":"ADD_LABEL","value":"IMPORTANT"}]');
  const [prompt, setPrompt] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const generate = () => {
    if (!prompt.trim()) return;
    setGenError(null);
    startTransition(async () => {
      const result = await generateRuleJson(prompt);
      if (!result.ok) {
        setGenError(result.reason);
        return;
      }
      setName(result.rule.name);
      setDescription(result.rule.description ?? "");
      setMatchMode(result.rule.matchMode);
      setConditions(JSON.stringify(result.rule.conditions, null, 1));
      setActions(JSON.stringify(result.rule.actions, null, 1));
    });
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2 dark:border-indigo-900/50 dark:bg-indigo-950/30">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              generate();
            }
          }}
          placeholder='Describe the rule in plain English — e.g. "archive cold sales pitches" or "star anything from my accountant"'
          className={`${inputClass} border-transparent bg-transparent text-xs focus:border-indigo-300`}
        />
        <button
          type="button"
          onClick={generate}
          disabled={pending || !prompt.trim()}
          className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "Generating…" : "✦ Generate"}
        </button>
      </div>
      {genError && <p className="text-xs text-red-500">{genError}</p>}

      <form action={saveRule} className="grid grid-cols-2 gap-2">
        <input
          name="name"
          placeholder="Rule name"
          required
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          name="description"
          placeholder="Description (optional)"
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <select name="emailAccountId" className={inputClass} defaultValue="">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.emailAddress}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select
            name="matchMode"
            className={inputClass}
            value={matchMode}
            onChange={(e) => setMatchMode(e.target.value)}
          >
            <option value="ALL">Match ALL</option>
            <option value="ANY">Match ANY</option>
          </select>
          <select name="trigger" className={inputClass} defaultValue="ON_MESSAGE_SYNC">
            <option value="ON_MESSAGE_SYNC">On sync</option>
            <option value="ON_AI_CLASSIFICATION">On AI classify</option>
            <option value="MANUAL">Manual</option>
          </select>
        </div>
        <input
          name="priority"
          type="number"
          placeholder="Priority (higher runs first)"
          className={inputClass}
        />
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input type="checkbox" name="isEnabled" defaultChecked className="accent-indigo-600" />
          Enabled
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <input type="checkbox" name="autoSend" className="accent-indigo-600" />
          Auto-send drafts
          <span className="text-[10px] text-zinc-400">(still undoable during the send delay)</span>
        </label>

        <p className="col-span-2 mt-1 text-xs font-medium text-zinc-500">Condition (JSON array)</p>
        <textarea
          name="conditions"
          rows={3}
          className={`${inputClass} col-span-2 font-mono text-xs`}
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
        />
        <p className="col-span-2 text-xs font-medium text-zinc-500">Actions (JSON array)</p>
        <textarea
          name="actions"
          rows={3}
          className={`${inputClass} col-span-2 font-mono text-xs`}
          value={actions}
          onChange={(e) => setActions(e.target.value)}
        />
        <p className="col-span-2 text-[10px] text-zinc-400">
          Fields: {CONDITION_FIELDS.join(", ")} · Operators: {OPERATORS.join(", ")} · Actions:{" "}
          {ACTION_TYPES.join(", ")} — DRAFT_REPLY with no template generates an AI draft; WEBHOOK
          posts the message to the rule URL (or its own &quot;value&quot;).
        </p>
        <button className="col-span-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500">
          Save rule
        </button>
      </form>
    </div>
  );
}
