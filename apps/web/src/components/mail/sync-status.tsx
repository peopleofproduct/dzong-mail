"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const SYNC_INTERVAL_MS = 60 * 1000; // auto-sync every 60s while the app is open
const MIN_GAP_MS = 45 * 1000; // never sync twice within this window

function ago(ts: number): string {
  if (!ts) return "auto-sync on";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return "synced just now";
  if (s < 90) return "synced 1m ago";
  const m = Math.round(s / 60);
  if (m < 60) return `synced ${m}m ago`;
  return `synced ${Math.round(m / 60)}h ago`;
}

/**
 * Sync status + auto-sync driver, in the topbar like Gmail's refresh icon.
 * Polls /api/v1/sync every 60s and on window refocus (throttled), spins while
 * a sync is in flight, then shows "synced Xm ago". Click = sync now.
 * The `npm run worker` process covers the time the app isn't open at all.
 */
export function SyncStatus() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [lastOk, setLastOk] = useState(0);
  // Why post-sync produced nothing — distinguishes "AI offline" from
  // "nothing to index" so users aren't guessing why search feels dumb.
  const [aiNote, setAiNote] = useState<string | null>(null);
  const inFlight = useRef(false);
  const lastTry = useRef(0);
  const [, relabel] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    const tick = async () => {
      const now = Date.now();
      if (inFlight.current || now - lastTry.current < MIN_GAP_MS) return;
      inFlight.current = true;
      lastTry.current = now;
      setSyncing(true);
      try {
        const res = await fetch("/api/v1/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as {
            postSync?: { reason?: string }[];
          } | null;
          setAiNote(data?.postSync?.find((p) => p.reason)?.reason ?? null);
          setLastOk(Date.now());
          router.refresh();
        }
      } catch {
        // Offline or server restarting — retry on the next tick.
      } finally {
        inFlight.current = false;
        setSyncing(false);
      }
    };

    const interval = setInterval(tick, SYNC_INTERVAL_MS);
    const relabeler = setInterval(relabel, 30 * 1000);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      clearInterval(relabeler);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  return (
    <button
      onClick={() => {
        lastTry.current = 0;
        window.dispatchEvent(new Event("focus"));
      }}
      title={
        aiNote
          ? `Auto-sync on — but AI post-processing reports: ${aiNote}`
          : "Auto-syncs every minute — click to sync now"
      }
      className="flex items-center gap-1.5 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 sm:px-2 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
      <span
        className={`hidden text-[11px] whitespace-nowrap lg:inline ${
          aiNote ? "text-amber-500 dark:text-amber-400" : "text-zinc-400 dark:text-zinc-500"
        }`}
      >
        {syncing ? "Syncing…" : aiNote ? "synced · AI offline" : ago(lastOk)}
      </span>
    </button>
  );
}
