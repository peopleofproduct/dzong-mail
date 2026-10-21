"use client";

import { useReducer, useSyncExternalStore } from "react";
import { ListCollapse, Rows3 } from "lucide-react";

/**
 * One-click list-density switch in the topbar. Flips the density-compact
 * class on <html> and persists the same dzong-density cookie the Settings
 * dropdown writes — CSS-only, so the change is instant with no reload.
 * The class is applied by the layout's init script before hydration, so it
 * is read as external state (useSyncExternalStore) rather than via an
 * effect — getServerSnapshot keeps hydration consistent.
 */
export function DensityToggle() {
  const compact = useSyncExternalStore(
    () => () => {},
    () => document.documentElement.classList.contains("density-compact"),
    () => false,
  );
  // The class mutation doesn't notify the store — bump to re-read it.
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const toggle = () => {
    const next = !compact;
    document.documentElement.classList.toggle("density-compact", next);
    document.cookie = `dzong-density=${next ? "compact" : "comfortable"}; path=/; max-age=31536000; SameSite=Lax`;
    bump();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={compact ? "Comfortable view — roomier rows" : "Compact view — single-line rows"}
      aria-pressed={compact}
      aria-label="Toggle list density"
      className={`rounded-md p-2 transition-colors ${
        compact
          ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300"
          : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {compact ? <Rows3 size={15} /> : <ListCollapse size={15} />}
    </button>
  );
}
