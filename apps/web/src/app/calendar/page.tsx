import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { deleteTask, saveTask, toggleTask } from "@/lib/actions";

interface CalEvent {
  id: string;
  day: number;
  kind: "send" | "snooze" | "task" | "follow-up" | "event";
  label: string;
  sub?: string;
  done?: boolean;
  cancelled?: boolean;
  threadId?: string | null;
}

const KIND_STYLE: Record<CalEvent["kind"], string> = {
  send: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  snooze: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300",
  task: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  "follow-up": "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  event: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
};

const KIND_LABEL: Record<CalEvent["kind"], string> = {
  send: "Scheduled send",
  snooze: "Snooze returns",
  task: "To-do",
  "follow-up": "Follow-up reminder",
  event: "Invite",
};

const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function CalendarPage(props: PageProps<"/calendar">) {
  return (
    <Suspense fallback={null}>
      <CalendarBody searchParams={props.searchParams} />
    </Suspense>
  );
}

async function CalendarBody(props: Pick<PageProps<"/calendar">, "searchParams">) {
  await connection();
  const params = await props.searchParams;
  const now = new Date();
  const monthParam = typeof params.m === "string" ? params.m : "";
  const [y, mo] = monthParam.split("-").map(Number);
  const year = y >= 2000 && y <= 2100 ? y : now.getFullYear();
  const month = mo >= 1 && mo <= 12 ? mo - 1 : now.getMonth();

  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  const [scheduled, snoozed, tasks, reminders, invites] = await Promise.all([
    prisma.message.findMany({
      where: { isDraft: true, scheduledAt: { gte: monthStart, lt: monthEnd } },
      select: { id: true, subject: true, scheduledAt: true, toAddresses: true },
    }),
    prisma.message.findMany({
      where: { snoozedUntil: { gte: monthStart, lt: monthEnd } },
      select: { id: true, subject: true, snoozedUntil: true, fromName: true, fromAddress: true },
    }),
    prisma.task.findMany({
      where: { OR: [{ dueAt: { gte: monthStart, lt: monthEnd } }, { dueAt: null, doneAt: null }] },
      orderBy: { createdAt: "asc" },
    }),
    prisma.notification.findMany({
      where: { kind: "follow-up", createdAt: { gte: monthStart, lt: monthEnd } },
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.calendarEvent.findMany({
      where: { startsAt: { gte: monthStart, lt: monthEnd } },
      select: {
        id: true,
        summary: true,
        location: true,
        organizer: true,
        startsAt: true,
        endsAt: true,
        status: true,
        messageId: true,
        message: { select: { threadId: true } },
      },
    }),
  ]);

  // Calendar-aware planning: flag scheduled sends that would land mid-meeting.
  const eventSpan = (at: Date) =>
    invites.find(
      (e) =>
        e.status !== "CANCELLED" &&
        e.startsAt <= at &&
        at <= (e.endsAt ?? new Date(e.startsAt.getTime() + 60 * 60_000)),
    );

  const events: CalEvent[] = [
    ...scheduled
      .filter((m) => m.scheduledAt)
      .map((m) => {
        const clash = eventSpan(m.scheduledAt!);
        return {
          id: `send-${m.id}`,
          day: m.scheduledAt!.getDate(),
          kind: "send" as const,
          label: m.subject || "(no subject)",
          sub: `to ${m.toAddresses[0] ?? "?"}${clash ? ` - lands during "${clash.summary ?? "a meeting"}"` : ""}`,
        };
      }),
    ...snoozed
      .filter((m) => m.snoozedUntil)
      .map((m) => ({
        id: `snz-${m.id}`,
        day: m.snoozedUntil!.getDate(),
        kind: "snooze" as const,
        label: m.subject || "(no subject)",
        sub: m.fromName ?? m.fromAddress,
      })),
    ...tasks
      .filter((t) => t.dueAt)
      .map((t) => ({
        id: `task-${t.id}`,
        day: t.dueAt!.getDate(),
        kind: "task" as const,
        label: t.title,
        done: Boolean(t.doneAt),
      })),
    ...reminders.map((n) => ({
      id: `fu-${n.id}`,
      day: n.createdAt.getDate(),
      kind: "follow-up" as const,
      label: n.title,
    })),
    ...invites.map((e) => ({
      id: `ev-${e.id}`,
      day: e.startsAt.getDate(),
      kind: "event" as const,
      label: e.summary ?? "(untitled invite)",
      sub: [e.organizer, e.location].filter(Boolean).join(" - ") || undefined,
      cancelled: e.status === "CANCELLED",
      threadId: e.message?.threadId ?? null,
    })),
  ];

  const eventsByDay = new Map<number, CalEvent[]>();
  for (const e of events) {
    const list = eventsByDay.get(e.day) ?? [];
    list.push(e);
    eventsByDay.set(e.day, list);
  }

  // Day detail pane
  const dayParam = typeof params.d === "string" ? params.d : "";
  const selectedDay =
    /^\d{4}-\d{2}-\d{2}$/.test(dayParam) && dayParam.startsWith(`${year}-${pad(month + 1)}`)
      ? Number(dayParam.slice(8))
      : now.getFullYear() === year && now.getMonth() === month
        ? now.getDate()
        : 1;
  const dayEvents = eventsByDay.get(selectedDay) ?? [];
  const selectedTasks = tasks.filter((t) => t.dueAt && t.dueAt.getDate() === selectedDay);
  const openTasks = tasks.filter((t) => !t.dueAt && !t.doneAt);

  // Grid: weeks of 7 cells starting Sunday, leading/trailing blanks.
  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const monthName = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const mk = (d: Date) => `?m=${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-zinc-50 font-sans dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-6 py-5">
          <Link
            href="/"
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Calendar
          </h1>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            scheduled sends · snoozes · to-dos - all local
          </span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-6 py-6 lg:grid-cols-[1fr_300px]">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-3 flex items-center justify-between">
            <Link href={mk(prev)} className="rounded-md p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <ChevronLeft size={16} />
            </Link>
            <h2 className="text-sm font-semibold text-black dark:text-zinc-100">{monthName}</h2>
            <Link href={mk(next)} className="rounded-md p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <ChevronRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-7 gap-px text-center text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px rounded-lg bg-zinc-100 dark:bg-zinc-800/60">
            {cells.map((day, i) => {
              const isToday =
                day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
              const dayEvts = day ? (eventsByDay.get(day) ?? []) : [];
              return (
                <Link
                  key={i}
                  href={day ? `?m=${year}-${pad(month + 1)}&d=${key(new Date(year, month, day))}` : "#"}
                  aria-disabled={!day}
                  className={`flex min-h-20 flex-col gap-0.5 bg-white p-1.5 text-left align-top dark:bg-zinc-950 ${
                    day ? "" : "pointer-events-none opacity-40"
                  } ${day === selectedDay ? "ring-2 ring-indigo-400 ring-inset" : ""}`}
                >
                  {day && (
                    <>
                      <span
                        className={`w-fit rounded-full px-1.5 text-[11px] font-medium ${
                          isToday
                            ? "bg-indigo-600 text-white"
                            : "text-zinc-500 dark:text-zinc-400"
                        }`}
                      >
                        {day}
                      </span>
                      {dayEvts.slice(0, 3).map((e) => (
                        <span
                          key={e.id}
                          className={`truncate rounded px-1 text-[10px] ${KIND_STYLE[e.kind]} ${
                            e.done || e.cancelled ? "line-through opacity-60" : ""
                          }`}
                          title={`${KIND_LABEL[e.kind]}: ${e.label}${e.cancelled ? " (cancelled)" : ""}`}
                        >
                          {e.label}
                        </span>
                      ))}
                      {dayEvts.length > 3 && (
                        <span className="text-[9px] text-zinc-400">+{dayEvts.length - 3} more</span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {(Object.keys(KIND_LABEL) as CalEvent["kind"][]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500">
                <span className={`h-2 w-2 rounded-sm ${KIND_STYLE[k].split(" ")[0]}`} />
                {KIND_LABEL[k]}
              </span>
            ))}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              {new Date(year, month, selectedDay).toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </h3>
            {dayEvents.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-400">Nothing scheduled.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {dayEvents.map((e) => {
                  const label = (
                    <span
                      className={`w-fit rounded px-1.5 py-0.5 text-[11px] ${KIND_STYLE[e.kind]} ${
                        e.done || e.cancelled ? "line-through opacity-60" : ""
                      }`}
                    >
                      {e.label}
                    </span>
                  );
                  return (
                    <li key={e.id} className="flex flex-col">
                      {e.threadId ? (
                        <Link href={`/?thread=${encodeURIComponent(e.threadId)}`} className="w-fit hover:opacity-80">
                          {label}
                        </Link>
                      ) : (
                        label
                      )}
                      <span className="mt-0.5 text-[10px] text-zinc-400">
                        {KIND_LABEL[e.kind]}
                        {e.cancelled ? " - cancelled" : ""}
                        {e.sub ? ` - ${e.sub}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">To-dos</h3>
            <form action={saveTask} className="mt-2 flex gap-2">
              <input
                name="title"
                placeholder="Add a to-do…"
                required
                className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
              />
              <input
                name="dueAt"
                type="date"
                defaultValue={key(new Date(year, month, selectedDay))}
                className="rounded-md border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button className="rounded-md bg-zinc-900 px-2.5 text-xs text-white dark:bg-zinc-100 dark:text-black">
                Add
              </button>
            </form>
            <ul className="mt-3 flex flex-col gap-1">
              {[...selectedTasks, ...openTasks].map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-xs">
                  <form action={toggleTask.bind(null, t.id)}>
                    <button
                      className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                        t.doneAt
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-zinc-300 dark:border-zinc-600"
                      }`}
                      title={t.doneAt ? "Mark undone" : "Mark done"}
                    >
                      {t.doneAt ? "✓" : ""}
                    </button>
                  </form>
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      t.doneAt ? "text-zinc-400 line-through" : "text-zinc-700 dark:text-zinc-200"
                    }`}
                  >
                    {t.title}
                  </span>
                  {t.dueAt && (
                    <span className="text-[10px] text-zinc-400">{key(t.dueAt).slice(5)}</span>
                  )}
                  <form action={deleteTask.bind(null, t.id)}>
                    <button className="text-zinc-300 hover:text-red-500" title="Delete">
                      ×
                    </button>
                  </form>
                </li>
              ))}
              {selectedTasks.length === 0 && openTasks.length === 0 && (
                <li className="text-[11px] text-zinc-400">No to-dos yet.</li>
              )}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}
