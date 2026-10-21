import { DAY_NAMES } from "@/lib/analytics";

/* Pure-SVG chart primitives for the analytics page. Server-renderable,
   zero deps - every value arrives pre-computed from lib/analytics. */

const TONE_BG: Record<string, string> = {
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  sky: "bg-sky-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
  orange: "bg-orange-500",
};
const TONE_HEX: Record<string, string> = {
  indigo: "#6366f1",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  sky: "#0ea5e9",
  violet: "#8b5cf6",
  teal: "#14b8a6",
  orange: "#f97316",
};

export function Card({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-200/70 transition-shadow hover:shadow-md sm:p-6 dark:bg-zinc-900/70 dark:ring-zinc-800 ${className}`}
    >
      <h3 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {title}
      </h3>
      {subtitle && <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** In-app hover tooltip — styled, instant, no browser title delay. Wrap the
 *  trigger in `group relative` and drop <Tip>text</Tip> inside it. On
 *  edge-anchored triggers pass align so the bubble can't spill past the
 *  card edge. */
const TIP_BASE =
  "pointer-events-none absolute bottom-full z-30 mb-2 hidden rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] leading-snug font-medium whitespace-nowrap text-white shadow-xl group-hover:block dark:bg-zinc-100 dark:text-zinc-900";
const TIP_ALIGN = {
  center: "left-1/2 -translate-x-1/2",
  start: "left-0",
  end: "right-0",
} as const;

function Tip({
  children,
  align = "center",
}: {
  children: React.ReactNode;
  align?: keyof typeof TIP_ALIGN;
}) {
  return <span className={`${TIP_BASE} ${TIP_ALIGN[align]}`}>{children}</span>;
}

/** Big ring score - the page hero. Gradient stroke + soft glow. */
export function HealthRing({ score }: { score: number }) {
  const r = 84;
  const circ = 2 * Math.PI * r;
  const stops: [string, string] =
    score >= 75
      ? ["#34d399", "#10b981"]
      : score >= 45
        ? ["#818cf8", "#6366f1"]
        : score >= 20
          ? ["#fbbf24", "#f59e0b"]
          : ["#fb7185", "#f43f5e"];
  const color = stops[1];
  return (
    <div
      className="group relative mx-auto h-48 w-48"
      title=""
      style={{ filter: `drop-shadow(0 0 18px ${color}33)` }}
    >
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="health-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={stops[0]} />
            <stop offset="100%" stopColor={stops[1]} />
          </linearGradient>
        </defs>
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          strokeWidth="14"
          className="stroke-zinc-100 dark:stroke-zinc-800"
        />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke="url(#health-ring-grad)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - score / 100)}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {score}
        </span>
        <span className="mt-1 text-xs font-medium tracking-wide text-zinc-400 uppercase">
          inbox health
        </span>
        <span className="mt-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color }}>
          {score >= 75
            ? "excellent"
            : score >= 45
              ? "fair"
              : score >= 20
                ? "needs work"
                : "critical"}
        </span>
      </div>
      <Tip>processing 40% · unread 25% · reply debt 25% · streak 10%</Tip>
    </div>
  );
}

/** Weekly inflow bars with a subtle trend feel. */
export function WeeklyBars({ weekly }: { weekly: { label: string; count: number }[] }) {
  const max = Math.max(1, ...weekly.map((w) => w.count));
  const avg = weekly.reduce((a, w) => a + w.count, 0) / Math.max(1, weekly.length);
  return (
    <div>
      <div className="flex h-44 items-end gap-2">
        {weekly.map((w, i) => (
          <div
            key={i}
            className="group relative flex flex-1 flex-col items-center justify-end gap-1.5 self-stretch"
          >
            <Tip>
              {w.count} messages · week of {w.label}
            </Tip>
            <div
              className={`w-full rounded-t-lg transition-all duration-300 group-hover:brightness-110 ${
                w.count >= avg * 1.25
                  ? "bg-gradient-to-t from-indigo-600 to-violet-500"
                  : "bg-gradient-to-t from-indigo-200 to-indigo-300 group-hover:from-indigo-300 group-hover:to-indigo-400 dark:from-indigo-800 dark:to-indigo-700"
              }`}
              style={{ height: `${Math.max(3, (w.count / max) * 90)}%` }}
            />
            <span className="w-full truncate text-center text-[9px] text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
              {w.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        Darker bars mark weeks running 25%+ above your average ({Math.round(avg)}/week).
      </p>
    </div>
  );
}

/** 7x24 arrival heatmap - "when does mail actually hit". */
export function ArrivalHeatmap({ heatmap }: { heatmap: number[][] }) {
  const max = Math.max(1, ...heatmap.flat());
  const hours = [0, 6, 12, 18];
  return (
    <div>
      {/* p-1.5 buffer: hover-scaled edge cells grow into the padding instead
          of painting past the card boundary. */}
      <div className="grid gap-[3px] p-1.5" style={{ gridTemplateColumns: "2rem repeat(24, 1fr)" }}>
        <div />
        {hours.map((h) => (
          <span key={h} className="text-[9px] text-zinc-400" style={{ gridColumn: `${h + 2}` }}>
            {h}
          </span>
        ))}
        {heatmap.map((day, d) => (
          <div key={d} className="contents">
            <span className="flex items-center text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
              {DAY_NAMES[d]}
            </span>
            {day.map((count, h) => (
              <div
                key={h}
                className={`group relative aspect-square cursor-default rounded-[4px] transition-transform duration-100 hover:z-20 hover:scale-125 hover:shadow-md ${
                  count === 0 ? "bg-zinc-100 dark:bg-zinc-800/60" : ""
                }`}
                style={
                  count === 0
                    ? undefined
                    : { backgroundColor: `rgba(99,102,241,${0.15 + 0.85 * (count / max)})` }
                }
              >
                <Tip align={h <= 2 ? "start" : h >= 21 ? "end" : "center"}>
                  {DAY_NAMES[d]} {h}:00 — {count} mail{count === 1 ? "" : "s"}
                </Tip>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-zinc-400">
        less
        {[0.15, 0.4, 0.65, 1].map((o) => (
          <span
            key={o}
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: `rgba(99,102,241,${o})` }}
          />
        ))}
        more
      </div>
    </div>
  );
}

/** Category donut with legend. */
export function CategoryDonut({
  categories,
}: {
  categories: { label: string; count: number; pct: number; tone: string }[];
}) {
  const r = 70;
  const circ = 2 * Math.PI * r;
  const segments = categories.reduce<
    { len: number; offset: number; label: string; tone: string; pct: number }[]
  >((segs, c) => {
    const len = (c.pct / 100) * circ;
    const offset = segs.length ? segs[segs.length - 1].offset + segs[segs.length - 1].len : 0;
    segs.push({ len, offset, label: c.label, tone: c.tone, pct: c.pct });
    return segs;
  }, []);
  return (
    <div className="flex items-center gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
          {segments.map((c) => (
            <circle
              key={c.label}
              cx="90"
              cy="90"
              r={r}
              fill="none"
              stroke={TONE_HEX[c.tone] ?? TONE_HEX.indigo}
              strokeWidth="22"
              strokeDasharray={`${Math.max(0, c.len - 2)} ${circ - c.len + 2}`}
              strokeDashoffset={-c.offset}
              className="transition-opacity duration-150 hover:opacity-60"
            >
              <title>
                {c.label} — {c.pct}%
              </title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
          mix
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1">
        {categories.map((c) => (
          <li
            key={c.label}
            className="group relative -mx-1.5 flex cursor-default items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_BG[c.tone]}`} />
            <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">{c.label}</span>
            <span className="ml-auto shrink-0 font-medium text-zinc-900 tabular-nums dark:text-zinc-100">
              {c.pct}%
            </span>
            <Tip>
              {c.count} messages · {c.pct}% of synced mail
            </Tip>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Top senders as proportional rows. */
export function SenderBars({
  senders,
}: {
  senders: { name: string; count: number; pct: number }[];
}) {
  const max = Math.max(1, ...senders.map((s) => s.count));
  return (
    <ul className="space-y-1">
      {senders.map((s) => (
        <li
          key={s.name}
          className="group relative -mx-2 cursor-default rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
        >
          <div className="flex items-baseline justify-between text-xs">
            <span className="min-w-0 truncate font-medium text-zinc-700 dark:text-zinc-300">
              {s.name}
            </span>
            <span className="ml-2 shrink-0 text-zinc-400 tabular-nums">
              {s.count} · {s.pct}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500 transition-all duration-300 group-hover:from-indigo-500 group-hover:to-violet-600"
              style={{ width: `${Math.max(2, (s.count / max) * 100)}%` }}
            />
          </div>
          <Tip>
            {s.count} messages · {s.pct}% of the mailbox
          </Tip>
        </li>
      ))}
    </ul>
  );
}

/** Flow balance: in vs handled vs sent. */
export function FlowBalance({
  flow,
}: {
  flow: { received: number; handled: number; sent: number; periodDays: number };
}) {
  const max = Math.max(1, flow.received, flow.handled, flow.sent);
  const rows: { label: string; value: number; grad: string; hint: string }[] = [
    {
      label: "Received",
      value: flow.received,
      grad: "from-indigo-500 to-indigo-400",
      hint: `landed in the last ${flow.periodDays} days`,
    },
    {
      label: "Handled",
      value: flow.handled,
      grad: "from-emerald-500 to-teal-400",
      hint: "archived out of the inbox, all-time",
    },
    {
      label: "Sent",
      value: flow.sent,
      grad: "from-sky-500 to-indigo-400",
      hint: `sent in the last ${flow.periodDays} days`,
    },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div
          key={r.label}
          className="group relative -mx-2 cursor-default rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
        >
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{r.label}</span>
            <span className="text-zinc-400 tabular-nums">{r.value}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${r.grad} transition-all duration-300`}
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </div>
          <Tip>
            {r.value} — {r.hint}
          </Tip>
        </div>
      ))}
      <p className="pt-1 text-xs text-zinc-400">
        Last {flow.periodDays} days. Handled counts everything you have ever archived.
      </p>
    </div>
  );
}

/** Reply-debt aging buckets. */
export function DebtAging({ buckets }: { buckets: { bucket: string; count: number }[] }) {
  const total = Math.max(
    1,
    buckets.reduce((a, b) => a + b.count, 0),
  );
  const colors = ["bg-emerald-400", "bg-amber-400", "bg-orange-500", "bg-rose-500"];
  const labels = ["fresh", "recent", "aging", "forgotten?"];
  return (
    <div>
      <div className="flex h-4 gap-[3px]">
        {buckets.map((b, i) => (
          <div
            key={b.bucket}
            className={`group relative cursor-default rounded-md transition-all hover:brightness-95 ${colors[i]}`}
            style={{ width: `${Math.max(4, (b.count / total) * 100)}%` }}
          >
            <Tip>
              {b.count} thread{b.count === 1 ? "" : "s"} waiting {b.bucket}
            </Tip>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {buckets.map((b, i) => (
          <div key={b.bucket} className="text-center">
            <p
              className={`text-lg font-bold tabular-nums ${i >= 2 ? "text-rose-500" : "text-zinc-900 dark:text-zinc-100"}`}
            >
              {b.count}
            </p>
            <p className="text-[10px] text-zinc-400">{b.bucket}</p>
            <p className="text-[9px] text-zinc-300 dark:text-zinc-600">{labels[i]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
