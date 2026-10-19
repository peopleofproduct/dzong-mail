"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const SYNC_INTERVAL_MS = 2 * 60 * 1000; // pull new mail every 2 minutes
const MIN_GAP_MS = 45 * 1000; // don't sync more often than this on refocus

/**
 * Keeps the inbox live while the app is open: triggers a sync every
 * SYNC_INTERVAL_MS and whenever the window regains focus (throttled), then
 * refreshes the server components so new mail appears without a reload.
 * The standalone worker (`npm run worker`) covers background syncing when
 * the app isn't open — this is the in-app complement.
 */
export function AutoSync() {
  const router = useRouter();
  const lastSync = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    const tick = async () => {
      const now = Date.now();
      if (inFlight.current || now - lastSync.current < MIN_GAP_MS) return;
      inFlight.current = true;
      lastSync.current = now;
      try {
        const res = await fetch("/api/v1/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (res.ok) router.refresh();
      } catch {
        // Offline or dev server restarting — retry on the next tick.
      } finally {
        inFlight.current = false;
      }
    };

    const interval = setInterval(tick, SYNC_INTERVAL_MS);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  return null;
}
