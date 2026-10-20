"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Pref = "light" | "dark" | "system";
const ORDER: Pref[] = ["system", "light", "dark"];
const EVENT = "dzong-theme-change";

function getPref(): Pref {
  const v = localStorage.getItem("dzong-theme");
  return v === "light" || v === "dark" ? v : "system";
}

function apply(pref: Pref) {
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Light / dark / system theme toggle — cycles on click, persists choice. */
export function ThemeToggle() {
  const pref = useSyncExternalStore(subscribe, getPref, () => "system" as Pref);

  // Follow the OS while "system" is selected.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getPref() === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    localStorage.setItem("dzong-theme", next);
    apply(next);
    window.dispatchEvent(new Event(EVENT));
  };

  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : Monitor;
  return (
    <button
      onClick={cycle}
      title={`Theme: ${pref} (click to change)`}
      aria-label={`Theme: ${pref}`}
      className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      <Icon size={15} />
    </button>
  );
}
