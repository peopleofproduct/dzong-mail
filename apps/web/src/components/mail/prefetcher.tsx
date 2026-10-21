"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const STORE_KEY = "dzong-nav-freq";
const MAX_ENTRIES = 50;
const PREFETCH_TOP_N = 4;

/** Params that define a distinct "screen" — ephemeral params like thread,
 *  selected, compose and q don't count as separate destinations. */
const SCREEN_PARAMS = ["view", "account", "label", "folder", "filter", "sm"];

/** Canonical routes every mail user ends up needing — merged with observed
 *  favourites so first-run users still get warm screens. */
const DEFAULT_ROUTES = [
  "/?view=inbox",
  "/?view=needs-reply",
  "/?view=sent",
  "/analytics",
];

type FreqMap = Record<string, number>;

function readFreq(): FreqMap {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as FreqMap) : {};
  } catch {
    return {};
  }
}

function writeFreq(map: FreqMap) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {
    /* private mode / quota — prefetching just falls back to defaults */
  }
}

/** Normalise a location down to its screen identity so /?view=sent&thread=x
 *  and /?view=sent&selected=y count as the same screen. */
function screenKey(pathname: string, search: URLSearchParams): string {
  const p = new URLSearchParams();
  for (const k of SCREEN_PARAMS) {
    const v = search.get(k);
    if (v) p.set(k, v);
  }
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

function topRoutes(current: string): string[] {
  const freq = readFreq();
  const observed = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([href]) => href);
  const seen = new Set<string>([current]);
  const out: string[] = [];
  for (const href of [...observed, ...DEFAULT_ROUTES]) {
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= PREFETCH_TOP_N) break;
  }
  return out;
}

/**
 * Learns which screens this user actually visits and keeps their payloads
 * warm: every navigation bumps a localStorage frequency map, then once the
 * page goes idle the most-visited routes are prefetched into the router
 * cache. Fully local — the map never leaves the browser.
 */
export function Prefetcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const screen = screenKey(pathname, new URLSearchParams(searchParams.toString()));

  // Record the visit.
  useEffect(() => {
    const freq = readFreq();
    freq[screen] = (freq[screen] ?? 0) + 1;
    // Bound the map so a long-lived install doesn't grow it forever —
    // keep only the most-visited entries.
    const entries = Object.entries(freq);
    if (entries.length > MAX_ENTRIES) {
      const trimmed = Object.fromEntries(
        entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_ENTRIES),
      );
      writeFreq(trimmed);
    } else {
      writeFreq(freq);
    }
  }, [screen]);

  // Once the page has settled, warm the user's habitual next screens.
  useEffect(() => {
    const run = () => {
      for (const href of topRoutes(screen)) {
        router.prefetch(href);
      }
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 1500);
    return () => clearTimeout(t);
  }, [screen, router]);

  return null;
}
