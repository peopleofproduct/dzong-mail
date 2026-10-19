import { connection } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import {
  getAutoFollowUp,
  getFollowUpDays,
  getRequestReadReceipts,
  getSplitLabels,
  getUndoSendSeconds,
} from "@/lib/settings";
import {
  deleteSnippet,
  importMailAction,
  savePrefs,
  saveSnippet,
  saveSplitLabels,
} from "@/lib/actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const btnClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";
const h3 = "text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400";

/**
 * Power-user surface: send/notification preferences, custom inbox splits,
 * snippets and the .eml/.mbox import. All server-rendered forms — the
 * matching actions live in lib/actions.ts.
 */
export async function WorkspaceSection() {
  await connection();
  const [
    undoSendSeconds,
    followUpDays,
    autoFollowUp,
    requestReceipts,
    activeSplits,
    snippets,
    labelRows,
  ] = await Promise.all([
    getUndoSendSeconds(),
    getFollowUpDays(),
    getAutoFollowUp(),
    getRequestReadReceipts(),
    getSplitLabels(),
    prisma.snippet.findMany({ orderBy: { name: "asc" } }),
    prisma.message.findMany({
      where: { labels: { isEmpty: false } },
      select: { labels: true },
      distinct: ["labels"],
      take: 200,
    }),
  ]);
  const knownLabels = [...new Set(labelRows.flatMap((r) => r.labels))].sort();
  const density =
    (await cookies()).get("unwalled-density")?.value === "compact"
      ? "compact"
      : "comfortable";

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        Workspace
      </h2>

      {/* Sending + follow-up preferences */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className={h3}>Sending &amp; nudges</h3>
        <form action={savePrefs} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Undo send window (seconds)
            <input
              name="undoSendSeconds"
              type="number"
              min={0}
              max={60}
              defaultValue={undoSendSeconds}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Remind me when awaiting reply for (days)
            <input
              name="followUpDays"
              type="number"
              min={1}
              max={30}
              defaultValue={followUpDays}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Auto follow-up
            <select name="autoFollowUp" defaultValue={autoFollowUp} className={inputClass}>
              <option value="off">Remind only</option>
              <option value="draft">Draft a nudge for review</option>
              <option value="send">Send automatically (undo window applies)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            List density
            <select name="density" defaultValue={density} className={inputClass}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              name="requestReadReceipts"
              defaultChecked={requestReceipts}
              className="accent-indigo-600"
            />
            Request read receipts on outgoing mail
          </label>
          <div className="flex items-end">
            <button className={btnClass}>Save preferences</button>
          </div>
        </form>
        <p className="mt-2 text-[11px] text-zinc-400">
          Undo-send holds every outgoing message for the configured delay - recall it from the toast
          before it leaves the machine. Follow-up reminders land in the notification bell.
        </p>
      </div>

      {/* Custom inbox splits */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className={h3}>Inbox sections</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Pin labels as their own collapsible sections above &quot;Everything else&quot;. Pick from
          labels already on your mail.
        </p>
        <form action={saveSplitLabels} className="mt-3 flex flex-wrap items-center gap-3">
          {knownLabels.length === 0 && (
            <p className="text-xs text-zinc-400">No labels on your mail yet.</p>
          )}
          {knownLabels.map((label) => (
            <label
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-xs dark:border-zinc-700"
            >
              <input
                type="checkbox"
                name="splitLabel"
                value={label}
                defaultChecked={activeSplits.includes(label)}
                className="accent-indigo-600"
              />
              {label}
            </label>
          ))}
          {knownLabels.length > 0 && <button className={btnClass}>Save sections</button>}
        </form>
      </div>

      {/* Snippets */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className={h3}>Snippets</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Reusable blocks insertable from the composer&apos;s Snippet menu.
        </p>
        {snippets.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {snippets.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-3 rounded-md border border-zinc-100 px-3 py-2 dark:border-zinc-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-black dark:text-zinc-100">{s.name}</p>
                  <p className="truncate text-xs text-zinc-500">{s.body}</p>
                </div>
                <form action={deleteSnippet.bind(null, s.id)}>
                  <button className="text-xs text-red-500 hover:text-red-400">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={saveSnippet} className="mt-3 grid gap-2">
          <input name="name" placeholder="Name (e.g. Intro, Pricing reply)" required className={inputClass} />
          <textarea
            name="body"
            placeholder="Snippet text - inserted at the cursor"
            required
            rows={2}
            className={inputClass}
          />
          <div>
            <button className={btnClass}>Add snippet</button>
          </div>
        </form>
      </div>

      {/* Import */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className={h3}>Import mail</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Bring an archive from Thunderbird, Apple Mail or any export: <code>.eml</code> files or an{" "}
          <code>.mbox</code> folder (up to 100 MB). Imported mail lands under an
          &quot;import@local&quot; account and joins search, threads and analytics.
        </p>
        <form action={importMailAction} className="mt-3 flex items-center gap-3">
          <input
            name="files"
            type="file"
            multiple
            accept=".eml,.mbox,message/rfc822"
            required
            className="text-xs text-zinc-500 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white dark:file:bg-zinc-100 dark:file:text-black"
          />
          <button className={btnClass}>Import</button>
        </form>
      </div>
    </section>
  );
}
