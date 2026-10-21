"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BellOff,
  CheckCheck,
  ExternalLink,
  MailX,
  RotateCcw,
  Search,
  ThumbsUp,
  X,
} from "lucide-react";
import {
  bulkUnsubscribeSenders,
  keepSubscriptionSenders,
  muteSubscriptionSenders,
  unkeepSubscriptionSender,
} from "@/lib/actions";
import { SenderAvatar } from "@/components/mail/sender-avatar";
import type { SubscriptionSummary } from "@/lib/queries";

/** Read-rate bar — the glanceable "do I even open this?" signal. */
function ReadBar({ pct }: { pct: number }) {
  const color =
    pct < 20 ? "bg-rose-400" : pct < 50 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <span className="flex w-24 items-center justify-end gap-1.5" title={`${pct}% of their mail read`}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </span>
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-zinc-400">
        {pct}%
      </span>
    </span>
  );
}

/**
 * Bulk unsubscribe manager — checkbox-driven sweep over every bulk sender.
 * "Suggested" = volume ≥3, read-rate <35%: the cuts the data already argues
 * for. "Keep" pins a sender out of the ranking (Settings-local record).
 */
export function SubscriptionsManager({ subs }: { subs: SubscriptionSummary[] }) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [archiveOnUnsub, setArchiveOnUnsub] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter(
      (s) =>
        s.fromAddress.toLowerCase().includes(q) ||
        (s.fromName ?? "").toLowerCase().includes(q),
    );
  }, [subs, query]);

  const suggestedCount = subs.filter((s) => s.suggested).length;
  // Anything not yet handled is selectable — unsubscribe needs a header,
  // mute/keep work on every sender.
  const selectable = visible.filter((s) => !s.unsubscribed && !s.muted);
  const allChecked =
    selectable.length > 0 && selectable.every((s) => checked.has(s.fromAddress));

  const toggleAll = () => {
    setChecked(
      allChecked ? new Set() : new Set(selectable.map((s) => s.fromAddress)),
    );
  };

  const toggle = (addr: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      return next;
    });

  const unsubscribe = (addresses: string[]) => {
    if (addresses.length === 0) return;
    startTransition(async () => {
      const r = await bulkUnsubscribeSenders(addresses, archiveOnUnsub);
      setChecked(new Set());
      setLinks(r.links);
      setResult(
        [
          r.done.length > 0 &&
            `Unsubscribed ${r.done.length} sender${r.done.length === 1 ? "" : "s"}${archiveOnUnsub ? " and archived their mail" : ""}`,
          r.failed.length > 0 &&
            `${r.failed.length} had no opt-out link — archived only`,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      router.refresh();
    });
  };

  const keep = (addresses: string[]) => {
    if (addresses.length === 0) return;
    startTransition(async () => {
      await keepSubscriptionSenders(addresses);
      setChecked(new Set());
      setResult(`Kept ${addresses.length} sender${addresses.length === 1 ? "" : "s"} — out of suggestions`);
      router.refresh();
    });
  };

  const mute = (addresses: string[]) => {
    if (addresses.length === 0) return;
    startTransition(async () => {
      await muteSubscriptionSenders(addresses);
      setChecked(new Set());
      setResult(
        `Muted ${addresses.length} sender${addresses.length === 1 ? "" : "s"} — a rule now auto-archives their mail (manage rules in Settings)`,
      );
      router.refresh();
    });
  };

  const rowBtn =
    "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-40";

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar — suggestion count, search, archive preference. */}
      <div className="flex flex-wrap items-center gap-2">
        {suggestedCount > 0 && (
          <button
            type="button"
            onClick={() =>
              setChecked(
                new Set(
                  subs
                    .filter((s) => s.suggested && s.canUnsubscribe)
                    .map((s) => s.fromAddress),
                ),
              )
            }
            className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-200/70 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-950"
          >
            ✦ Select {suggestedCount} suggested
          </button>
        )}
        <div className="flex min-w-40 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
          <Search size={13} className="shrink-0 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search senders…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              <X size={13} className="text-zinc-400" />
            </button>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={archiveOnUnsub}
            onChange={(e) => setArchiveOnUnsub(e.target.checked)}
            className="h-3.5 w-3.5 accent-indigo-600"
          />
          Archive their mail too
        </label>
      </div>

      {result && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
          {result}
        </p>
      )}
      {links.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="font-medium">
            {links.length} sender{links.length === 1 ? "" : "s"} need a manual confirm — their mail
            is already {archiveOnUnsub ? "archived" : "tagged"}:
          </p>
          <ul className="mt-1.5 space-y-1">
            {links.map((l) => (
              <li key={l}>
                <a
                  href={l}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
                >
                  <ExternalLink size={10} /> {l}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The sweep list. */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex items-center gap-3 border-b border-zinc-100 bg-zinc-50/60 px-4 py-2 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase dark:border-zinc-800 dark:bg-zinc-900/80">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="h-3.5 w-3.5 accent-indigo-600"
            aria-label="Select all"
          />
          <span className="flex-1">Sender</span>
          <span className="hidden w-16 text-right sm:block">Msgs</span>
          <span className="hidden w-24 text-right sm:block">You read</span>
          <span className="hidden w-24 text-right md:block">Last mail</span>
          <span className="w-48 text-right">Actions</span>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-zinc-400">
            <CheckCheck size={28} />
            <p className="text-sm">
              {query ? "No senders match that search." : "No bulk senders found — inbox is clean."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {visible.map((s) => {
              const dimmed = s.unsubscribed || s.kept || s.muted;
              return (
                <li
                  key={s.fromAddress}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    dimmed ? "opacity-55" : ""
                  } ${checked.has(s.fromAddress) ? "bg-indigo-50/50 dark:bg-indigo-950/20" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(s.fromAddress)}
                    onChange={() => toggle(s.fromAddress)}
                    disabled={s.unsubscribed || s.muted}
                    className="h-3.5 w-3.5 shrink-0 accent-indigo-600"
                    aria-label={`Select ${s.fromAddress}`}
                  />
                  <SenderAvatar email={s.fromAddress} name={s.fromName} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {s.fromName ?? s.fromAddress}
                      {s.suggested && (
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                          suggested
                        </span>
                      )}
                      {s.kept && (
                        <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          keeping
                        </span>
                      )}
                      {s.unsubscribed && (
                        <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-px text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          unsubscribed
                        </span>
                      )}
                      {s.muted && (
                        <span className="shrink-0 rounded bg-zinc-200 px-1.5 py-px text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          muted
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-zinc-400">{s.fromAddress}</p>
                  </div>
                  <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-zinc-500 sm:block">
                    {s.count}
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    <ReadBar pct={s.readPct} />
                  </span>
                  <span className="hidden w-24 shrink-0 text-right text-xs text-zinc-400 md:block">
                    {new Date(s.lastReceivedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="flex w-48 shrink-0 items-center justify-end gap-1.5">
                    {s.unsubscribed || s.muted ? (
                      <span className="text-[11px] text-zinc-400">handled</span>
                    ) : s.kept ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await unkeepSubscriptionSender(s.fromAddress);
                            router.refresh();
                          })
                        }
                        className={`${rowBtn} border-zinc-300 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800`}
                      >
                        <RotateCcw size={10} className="mr-1 inline" /> Unkeep
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => keep([s.fromAddress])}
                          title="Keep — pin out of suggestions"
                          className={`${rowBtn} border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800`}
                        >
                          <ThumbsUp size={10} className="mr-1 inline" /> Keep
                        </button>
                        {s.canUnsubscribe ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => unsubscribe([s.fromAddress])}
                            className={`${rowBtn} border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-500`}
                          >
                            <MailX size={11} /> Unsubscribe
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => mute([s.fromAddress])}
                            title="No unsubscribe link — auto-archive their future mail instead"
                            className={`${rowBtn} border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800`}
                          >
                            <BellOff size={11} /> Mute
                          </button>
                        )}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-zinc-400">
        <ExternalLink size={11} className="mt-0.5 shrink-0" />
        Unsubscribing uses each sender&apos;s own mechanism (RFC 8058 one-click,
        HTTPS link, or mailto) — nothing is blocked locally, the opt-out is real.
      </p>

      {/* Sticky bulk-action bar — appears once anything is checked. */}
      {checked.size > 0 && (
        <div className="sticky bottom-4 z-10 mx-auto flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            {checked.size} selected
          </span>
          <button
            type="button"
            disabled={
              pending ||
              !subs.some((s) => checked.has(s.fromAddress) && s.canUnsubscribe)
            }
            onClick={() =>
              unsubscribe(
                [...checked].filter(
                  (a) => subs.find((s) => s.fromAddress === a)?.canUnsubscribe,
                ),
              )
            }
            className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            <MailX size={12} /> Unsubscribe
          </button>
          <button
            type="button"
            disabled={
              pending ||
              !subs.some((s) => checked.has(s.fromAddress) && !s.canUnsubscribe)
            }
            onClick={() =>
              mute(
                [...checked].filter(
                  (a) => !subs.find((s) => s.fromAddress === a)?.canUnsubscribe,
                ),
              )
            }
            title="No unsubscribe link — auto-archive their future mail instead"
            className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-3.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <BellOff size={12} /> Mute
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => keep([...checked])}
            className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-3.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ThumbsUp size={12} /> Keep
          </button>
          <button
            type="button"
            onClick={() => setChecked(new Set())}
            className="ml-1 rounded-full p-1 text-zinc-400 hover:text-zinc-600"
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
