import { connection } from "next/server";
import { getAccounts, getRules } from "@/lib/queries";
import { createColdEmailPreset, deleteRule, runRulesNow } from "@/lib/actions";
import { NewRuleForm } from "./new-rule-form";

function describeConditions(json: unknown): string {
  if (!Array.isArray(json)) return "—";
  return json
    .map((c) => {
      const cond = c as { field?: string; operator?: string; value?: string };
      return `${cond.field} ${cond.operator} "${cond.value}"`;
    })
    .join("  ·  ");
}

function describeActions(json: unknown): string {
  if (!Array.isArray(json)) return "—";
  return json
    .map((a) => {
      const act = a as { type?: string; value?: string };
      return act.value ? `${act.type} → ${act.value}` : (act.type ?? "?");
    })
    .join("  ·  ");
}

export async function RulesSection() {
  await connection();
  const [rules, accounts] = await Promise.all([getRules(), getAccounts()]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Automation rules
        </h2>
        <div className="flex gap-2">
          <form action={runRulesNow.bind(null, undefined, true)}>
            <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
              Dry run all
            </button>
          </form>
          <form action={runRulesNow.bind(null, undefined, false)}>
            <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300">
              Run rules now
            </button>
          </form>
          <form action={createColdEmailPreset}>
            <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
              + Cold email blocker
            </button>
          </form>
        </div>
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No rules yet. Rules match incoming mail on static fields or AI labels and archive, label,
          star, move, or draft replies automatically.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-black dark:text-zinc-100">
                  {rule.name}
                </span>
                {!rule.isEnabled && (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                    disabled
                  </span>
                )}
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                  {rule.matchMode === "ALL" ? "all conditions" : "any condition"}
                </span>
                <span className="ml-auto text-xs text-zinc-400">
                  {rule.lastRunAt ? `ran ${rule.lastRunAt.toLocaleString()}` : "never run"}
                </span>
                <form action={deleteRule.bind(null, rule.id)}>
                  <button className="text-xs text-red-500 hover:text-red-400">Delete</button>
                </form>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                <span className="font-medium">When:</span> {describeConditions(rule.conditions)}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                <span className="font-medium">Then:</span> {describeActions(rule.actions)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-100">
          New rule
        </summary>
        <NewRuleForm accounts={accounts} />
      </details>
    </section>
  );
}
