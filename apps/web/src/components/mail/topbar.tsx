"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart3, Keyboard, Menu, PenSquare, Search } from "lucide-react";
import { SyncStatus } from "./sync-status";
import { ThemeToggle } from "./theme-toggle";
import { buildParams } from "./params";

export function Topbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const semanticOn = searchParams.get("sm") === "1";

  // Close the mobile nav drawer after any navigation.
  useEffect(() => {
    const toggle = document.getElementById("nav-toggle") as HTMLInputElement | null;
    if (toggle) toggle.checked = false;
  }, [searchParams]);

  useEffect(() => {
    const onWindowKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "c") {
        router.push(buildParams(searchParams, { compose: "new" }));
      }
    };
    window.addEventListener("keydown", onWindowKey);
    return () => window.removeEventListener("keydown", onWindowKey);
  }, [router, searchParams]);

  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-zinc-200 bg-white/95 px-3 py-2.5 backdrop-blur sm:gap-3 sm:px-4 dark:border-zinc-800 dark:bg-zinc-950/95">
      <label
        htmlFor="nav-toggle"
        title="Menu"
        className="cursor-pointer rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 md:hidden dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <Menu size={17} />
      </label>
      <form
        className="relative flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q")?.toString().trim();
          router.push(buildParams(searchParams, { q: q || undefined }));
        }}
      >
        <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
        <input
          ref={inputRef}
          name="q"
          type="search"
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="Search mail…  ( / )"
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pr-14 pl-9 text-sm outline-none placeholder:text-zinc-400 focus:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900"
        />
        <button
          type="button"
          onClick={() =>
            router.push(buildParams(searchParams, { sm: semanticOn ? undefined : "1" }))
          }
          title="Toggle semantic (AI) search — meaning-based, needs embeddings"
          className={`absolute top-1/2 right-2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
            semanticOn
              ? "bg-indigo-600 text-white"
              : "text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          }`}
        >
          ✦ AI
        </button>
      </form>
      <SyncStatus />
      <button
        onClick={() => router.push("/analytics")}
        title="Analytics"
        className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <BarChart3 size={15} />
      </button>
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))}
        title="Keyboard shortcuts ( ? )"
        className="hidden rounded-md p-2 text-zinc-500 hover:bg-zinc-100 sm:block dark:hover:bg-zinc-800"
      >
        <Keyboard size={15} />
      </button>
      <ThemeToggle />
      <button
        onClick={() => router.push(buildParams(searchParams, { compose: "new" }))}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
      >
        <PenSquare size={14} />
        <span className="hidden sm:inline">Compose</span>
      </button>
    </header>
  );
}
