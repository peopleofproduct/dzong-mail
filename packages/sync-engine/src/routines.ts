import { randomBytes } from "node:crypto";
import { prisma } from "@unwalled/database";
import type { Prisma, PrismaClient } from "@unwalled/database";
import { askInbox } from "./semantic";
import { emit, recordAgentRun } from "./notify";

/**
 * User-defined recurring assistant routines ("every morning, summarize
 * overnight mail"). Stored as JSON in AppSetting - a whole table for a
 * handful of rows is overkill, and routines are preferences, not mail.
 */

const KEY = "agentRoutines";

export interface Routine {
  id: string;
  userId: string;
  prompt: string;
  everyHours: number;
  /** Wall-clock hour for daily routines (local time); omit for interval runs. */
  hour?: number;
  createdAt: number;
  lastRunAt?: number;
}

async function readAll(db: PrismaClient): Promise<Routine[]> {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  return Array.isArray(row?.value) ? (row.value as unknown as Routine[]) : [];
}

async function writeAll(routines: Routine[], db: PrismaClient): Promise<void> {
  const value = routines as unknown as Prisma.InputJsonValue;
  await db.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  });
}

export async function listRoutines(db: PrismaClient = prisma): Promise<Routine[]> {
  return readAll(db);
}

export async function saveRoutine(
  spec: { prompt: string; everyHours: number; hour?: number },
  db: PrismaClient = prisma,
): Promise<Routine> {
  const user = await db.user.findFirst({ select: { id: true } });
  if (!user) throw new Error("no local user");
  const routine: Routine = {
    id: `rtn_${randomBytes(6).toString("hex")}`,
    userId: user.id,
    prompt: spec.prompt,
    everyHours: Math.min(Math.max(spec.everyHours || 24, 1), 24 * 30),
    ...(spec.hour !== undefined ? { hour: spec.hour } : {}),
    createdAt: Date.now(),
  };
  await writeAll([...(await readAll(db)), routine], db);
  return routine;
}

export async function deleteRoutine(id: string, db: PrismaClient = prisma): Promise<void> {
  await writeAll(
    (await readAll(db)).filter((r) => r.id !== id),
    db,
  );
}

/** Is this routine due right now? Hourly routines run on interval; daily
 *  routines run once their clock hour has passed, once per day. */
function isDue(r: Routine, now: Date): boolean {
  if (r.hour === undefined) {
    return now.getTime() - (r.lastRunAt ?? 0) >= r.everyHours * 3_600_000;
  }
  const todays = new Date(now);
  todays.setHours(r.hour, 0, 0, 0);
  const lastDue = now >= todays ? todays : new Date(todays.getTime() - 86_400_000);
  return (r.lastRunAt ?? 0) < lastDue.getTime();
}

/** Worker hook: run due routines, deliver each result as a notification. */
export async function runDueRoutines(db: PrismaClient = prisma): Promise<number> {
  const routines = await readAll(db);
  const now = new Date();
  let ran = 0;
  for (const routine of routines.filter((r) => isDue(r, now))) {
    try {
      const result = await askInbox(routine.userId, routine.prompt, db);
      await emit(
        {
          kind: "routine",
          title: `Routine: ${routine.prompt.slice(0, 60)}`,
          body: result.ok
            ? (result.answer ?? "").slice(0, 2000)
            : `Couldn't run: ${result.reason ?? "failed"}`,
        },
        db,
      );
      await recordAgentRun("routine", { prompt: routine.prompt, ok: result.ok }, db);
      routine.lastRunAt = now.getTime();
      ran++;
    } catch (err) {
      console.error(`[routines] ${routine.id} failed:`, err);
      routine.lastRunAt = now.getTime(); // don't hot-loop a broken routine
    }
  }
  if (ran > 0) await writeAll(routines, db);
  return ran;
}
