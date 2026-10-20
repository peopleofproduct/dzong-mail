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
      className={`rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/60 ${className}`}
    >
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Big ring score - the page hero. */
export function HealthRing({ score }: { score: number }) {
  const r = 84;
  const circ = 2 * Math.PI * r;
  const color = score >= 75 ? "#10b981" : score >= 45 ? "#6366f1" : "#f59e0b";
  return (
    <div className="relative mx-auto h-48 w-48">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          strokeWidth="16"
          className="stroke-zinc-100 dark:stroke-zinc-800"
        />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="16"
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
    </div>
  );
}

/** Weekly inflow bars with a subtle trend feel. */
export function WeeklyBars({ weekly }: { weekly: { label: string; count: number }[] }) {
  const max = Math.max(1, ...weekly.map((w) => w.count));
  const avg = weekly.reduce((a, w) => a + w.count, 0) / Math.max(1, weekly.length);
  return (
    <div>
      <div className="flex h-40 items-end gap-2">
        {weekly.map((w, i) => (
          <div key={i} className="group flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[10px] font-medium text-zinc-500 opacity-0 transition group-hover:opacity-100 dark:text-zinc-400">
              {w.count}
            </span>
            <div
              className={`w-full rounded-t-md transition-colors ${
                w.count >= avg * 1.25
                  ? "bg-indigo-500 group-hover:bg-indigo-600"
                  : "bg-indigo-200 group-hover:bg-indigo-300 dark:bg-indigo-800 dark:group-hover:bg-indigo-700"
              }`}
              style={{ height: `${Math.max(3, (w.count / max) * 100)}%` }}
              title={`Week of ${w.label}: ${w.count} messages`}
            />
            <span className="w-full truncate text-center text-[9px] text-zinc-400">{w.label}</span>
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
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: "2rem repeat(24, 1fr)" }}>
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
                className={`aspect-square rounded-[3px] ${count === 0 ? "bg-zinc-100 dark:bg-zinc-800/60" : ""}`}
                style={
                  count === 0
                    ? undefined
                    : { backgroundColor: `rgba(99,102,241,${0.15 + 0.85 * (count / max)})` }
                }
                title={`${DAY_NAMES[d]} ${h}:00 - ${count} messages (90d)`}
              />
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
    { len: number; offset: number; label: string; tone: string }[]
  >((segs, c) => {
    const len = (c.pct / 100) * circ;
    const offset = segs.length ? segs[segs.length - 1].offset + segs[segs.length - 1].len : 0;
    segs.push({ len, offset, label: c.label, tone: c.tone });
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
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
          mix
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {categories.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-xs">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_BG[c.tone]}`} />
            <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">{c.label}</span>
            <span className="ml-auto shrink-0 font-medium text-zinc-900 dark:text-zinc-100">
              {c.pct}%
            </span>
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
    <ul className="space-y-2.5">
      {senders.map((s) => (
        <li key={s.name} className="group">
          <div className="flex items-baseline justify-between text-xs">
            <span className="min-w-0 truncate font-medium text-zinc-700 dark:text-zinc-300">
              {s.name}
            </span>
            <span className="ml-2 shrink-0 text-zinc-400">
              {s.count} · {s.pct}%
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-all"
              style={{ width: `${Math.max(2, (s.count / max) * 100)}%` }}
            />
          </div>
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
  const rows: { label: string; value: number; color: string }[] = [
    { label: "Received", value: flow.received, color: "bg-indigo-500" },
    { label: "Handled", value: flow.handled, color: "bg-emerald-500" },
    { label: "Sent", value: flow.sent, color: "bg-sky-500" },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{r.label}</span>
            <span className="text-zinc-400">{r.value}</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full ${r.color}`}
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
            />
          </div>
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
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full">
        {buckets.map((b, i) => (
          <div
            key={b.bucket}
            className={`${colors[i]} transition-all`}
            style={{ width: `${(b.count / total) * 100}%` }}
            title={`${b.bucket}: ${b.count}`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {buckets.map((b, i) => (
          <div key={b.bucket} className="text-center">
            <p
              className={`text-lg font-bold ${i >= 2 ? "text-rose-500" : "text-zinc-900 dark:text-zinc-100"}`}
            >
              {b.count}
            </p>
            <p className="text-[10px] text-zinc-400">{b.bucket}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
