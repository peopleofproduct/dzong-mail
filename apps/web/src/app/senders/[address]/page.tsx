import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { SenderAvatar } from "@/components/mail/sender-avatar";
import { Paperclip } from "lucide-react";

function fmtDuration(mins: number): string {
  if (mins < 60) return `${Math.round(mins)} min`;
  if (mins < 60 * 24) return `${(mins / 60).toFixed(1)} hrs`;
  return `${(mins / 60 / 24).toFixed(1)} days`;
}

/**
 * Relationship memory: a local-only dossier on one correspondent, built
 * entirely from the local store - interaction counts, reply reciprocity,
 * response-time medians, shared files, and who currently owes a reply.
 */
async function Dossier({ params }: { params: Promise<{ address: string }> }) {
  await connection();
  const { address } = await params;
  const raw = decodeURIComponent(address);
  const addr = raw.toLowerCase();
  const myAddrs = (await prisma.emailAccount.findMany({ select: { emailAddress: true } })).map(
    (a) => a.emailAddress.toLowerCase(),
  );

  const [fromThem, toThem, attachments, events] = await Promise.all([
    prisma.message.findMany({
      where: { fromAddress: { equals: addr, mode: "insensitive" }, isDraft: false },
      orderBy: { receivedAt: "desc" },
      take: 500,
      select: {
        id: true,
        subject: true,
        snippet: true,
        threadId: true,
        receivedAt: true,
        isRead: true,
        aiLabels: true,
      },
    }),
    prisma.message.findMany({
      where: {
        fromAddress: { in: myAddrs, mode: "insensitive" },
        isDraft: false,
        // has/hasSome are case-sensitive - try both casings.
        toAddresses: { hasSome: [addr, raw] },
      },
      orderBy: { receivedAt: "desc" },
      take: 500,
      select: { id: true, threadId: true, receivedAt: true },
    }),
    prisma.attachment.findMany({
      where: {
        filename: { not: "invite.ics" },
        message: { fromAddress: { equals: addr, mode: "insensitive" }, isDraft: false },
      },
      take: 10,
      select: { filename: true, sizeBytes: true, messageId: true },
    }),
    prisma.calendarEvent.findMany({
      where: {
        OR: [
          { organizer: { equals: addr, mode: "insensitive" } },
          { attendees: { hasSome: [addr, raw] } },
        ],
        status: { not: "CANCELLED" },
      },
      orderBy: { startsAt: "asc" },
      take: 5,
    }),
  ]);

  // Reply reciprocity: for threads we both participate in, the median gap
  // between their message and my next reply (and vice versa).
  const threadIds = new Set([
    ...fromThem.map((m) => m.threadId),
    ...toThem.map((m) => m.threadId),
  ]);
  const threadMsgs = await prisma.message.findMany({
    where: { threadId: { in: [...threadIds].filter((t): t is string => Boolean(t)) }, isDraft: false },
    orderBy: { receivedAt: "asc" },
    select: { threadId: true, fromAddress: true, receivedAt: true },
  });
  const byThread = new Map<string, typeof threadMsgs>();
  for (const m of threadMsgs) {
    if (!m.threadId) continue;
    byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m]);
  }
  const mine = new Set(myAddrs);
  const theirGaps: number[] = [];
  const myGaps: number[] = [];
  for (const msgs of byThread.values()) {
    let lastTheirs: Date | null = null;
    let lastMine: Date | null = null;
    for (const m of msgs) {
      const isMine = mine.has(m.fromAddress.toLowerCase());
      if (isMine && lastTheirs) {
        myGaps.push((m.receivedAt.getTime() - lastTheirs.getTime()) / 60000);
        lastTheirs = null;
      }
      if (!isMine && lastMine) {
        theirGaps.push((m.receivedAt.getTime() - lastMine.getTime()) / 60000);
        lastMine = null;
      }
      if (isMine) lastMine = m.receivedAt;
      else lastTheirs = m.receivedAt;
    }
  }
  const median = (xs: number[]) =>
    xs.length === 0 ? null : xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const myMedian = median(myGaps);
  const theirMedian = median(theirGaps);

  // Open loops: threads where the last word is theirs (I owe) or mine (they owe).
  let iOwe = 0;
  let theyOwe = 0;
  for (const msgs of byThread.values()) {
    const last = msgs[msgs.length - 1];
    if (!last) continue;
    if (mine.has(last.fromAddress.toLowerCase())) theyOwe++;
    else iOwe++;
  }

  const topLabels = [
    ...new Set(fromThem.flatMap((m) => m.aiLabels).filter((l) => l !== "UNREAD")),
  ].slice(0, 6);
  const first = fromThem[fromThem.length - 1]?.receivedAt;
  const upcoming = events.filter((e) => e.startsAt > new Date());
  const card = "rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900";
  const stat = "text-2xl font-semibold text-zinc-900 dark:text-zinc-50";
  const lbl = "text-xs text-zinc-400";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <Link href="/" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
        ← Back to inbox
      </Link>

      <div className={`${card} flex items-center gap-4`}>
        <SenderAvatar email={addr} name={addr} size={48} />
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{addr}</h1>
          <p className="text-xs text-zinc-400">
            {first
              ? `Corresponding since ${first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`
              : "No mail synced from this address"}
          </p>
          {topLabels.length > 0 && (
            <p className="mt-1 text-xs text-indigo-500 dark:text-indigo-400">
              Mostly: {topLabels.join(", ").toLowerCase().replaceAll("_", " ")}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={card}>
          <p className={stat}>{fromThem.length + toThem.length}</p>
          <p className={lbl}>messages exchanged</p>
        </div>
        <div className={card}>
          <p className={stat}>{fromThem.length}</p>
          <p className={lbl}>from them</p>
        </div>
        <div className={card}>
          <p className={stat}>{myMedian !== null ? fmtDuration(myMedian) : "-"}</p>
          <p className={lbl}>your median reply</p>
        </div>
        <div className={card}>
          <p className={stat}>{theirMedian !== null ? fmtDuration(theirMedian) : "-"}</p>
          <p className={lbl}>their median reply</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={card}>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Open loops
          </h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {iOwe > 0 ? (
              <Link href={`/?q=${encodeURIComponent(addr)}`} className="text-indigo-600 hover:underline dark:text-indigo-400">
                {iOwe} thread{iOwe === 1 ? "" : "s"} waiting on you →
              </Link>
            ) : (
              "Nothing waiting on you"
            )}
          </p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            {theyOwe > 0 ? `${theyOwe} thread${theyOwe === 1 ? "" : "s"} waiting on them` : "Nothing waiting on them"}
          </p>
        </div>
        <div className={card}>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Calendar
          </h2>
          {upcoming.length > 0 ? (
            <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              {upcoming.map((e) => (
                <li key={e.id}>
                  {e.summary ?? "Event"} -{" "}
                  {e.startsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                  {e.startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">No upcoming events with them</p>
          )}
        </div>
      </div>

      {attachments.length > 0 && (
        <div className={card}>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Files they sent
          </h2>
          <ul className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <li
                key={a.messageId + a.filename}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                <Paperclip size={11} />
                {a.filename}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={card}>
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Latest from them
        </h2>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {fromThem.slice(0, 8).map((m) => (
            <li key={m.id}>
              <Link
                href={m.threadId ? `/?thread=${encodeURIComponent(m.threadId)}` : `/?q=${encodeURIComponent(addr)}`}
                className="flex items-baseline gap-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <span className="w-16 shrink-0 text-xs text-zinc-400">
                  {m.receivedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                <span className={`min-w-0 truncate text-sm ${m.isRead ? "text-zinc-500" : "font-medium text-zinc-800 dark:text-zinc-200"}`}>
                  {m.subject ?? "(no subject)"}
                </span>
              </Link>
            </li>
          ))}
          {fromThem.length === 0 && <li className="py-2 text-sm text-zinc-400">Nothing yet.</li>}
        </ul>
      </div>
    </div>
  );
}

export default function SenderPage({ params }: PageProps<"/senders/[address]">) {
  return (
    <Suspense>
      <Dossier params={params} />
    </Suspense>
  );
}
