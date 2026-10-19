"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PenSquare, RefreshCw, Search } from "lucide-react";
import { syncAllNow } from "@/lib/actions";
import { buildParams } from "./params";

export function Topbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

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
    <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
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
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pr-3 pl-9 text-sm outline-none placeholder:text-zinc-400 focus:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900"
        />
      </form>
      <button
        onClick={() => void syncAllNow()}
        title="Sync all accounts"
        className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <RefreshCw size={15} />
      </button>
      <button
        onClick={() => router.push(buildParams(searchParams, { compose: "new" }))}
        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
      >
        <PenSquare size={14} />
        Compose
      </button>
    </header>
  );
}
