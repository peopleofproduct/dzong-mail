import { connection } from "next/server";
import { listRoutines } from "@unwalled/sync-engine";
import { deleteRoutineNow } from "@/lib/actions";

function cadenceLabel(everyHours: number, hour?: number): string {
  if (everyHours >= 168) return "every week";
  if (everyHours >= 24) return hour !== undefined ? `every day at ${hour}:00` : "every day";
  return `every ${everyHours}h`;
}

export async function RoutinesSection() {
  await connection();
  const routines = await listRoutines();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        Routines
      </h2>
      <p className="text-xs text-zinc-400">
        Recurring assistant jobs created from chat - &quot;every morning, summarize
        overnight mail&quot;. Each run lands as a notification. Managed entirely on
        this machine.
      </p>

      {routines.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No routines yet - ask the assistant to run something on a schedule.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {routines.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-black dark:text-zinc-100">
                  {r.prompt}
                </p>
                <p className="text-xs text-zinc-400">
                  {cadenceLabel(r.everyHours, r.hour)}
                  {r.lastRunAt
                    ? ` · last ran ${new Date(r.lastRunAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                    : " · hasn't run yet"}
                </p>
              </div>
              <form action={deleteRoutineNow.bind(null, r.id)}>
                <button className="rounded border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
