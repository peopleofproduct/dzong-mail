"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Command } from "cmdk";
import { buildParams } from "./params";
import { connectMockAccount, syncAllNow } from "@/lib/actions";

const NAV_ITEMS: Array<{ label: string; view: string }> = [
  { label: "Go to Inbox", view: "inbox" },
  { label: "Go to Starred", view: "starred" },
  { label: "Go to Snoozed", view: "snoozed" },
  { label: "Go to Drafts", view: "drafts" },
  { label: "Go to Sent", view: "sent" },
  { label: "Go to Newsletters", view: "newsletters" },
  { label: "Go to Needs reply", view: "needs-reply" },
  { label: "Go to Awaiting reply", view: "awaiting" },
  { label: "Go to Archive", view: "archive" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const go = (view: string) => {
    router.push(buildParams(searchParams, { view, selected: undefined, thread: undefined }));
    setOpen(false);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed inset-0 z-50"
    >
      <div className="flex items-start justify-center pt-[15vh]">
        <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
          <Command.Input
            placeholder="Type a command or search…"
            className="w-full border-b border-zinc-200 bg-transparent px-4 py-3 text-sm placeholder-zinc-400 outline-none dark:border-zinc-800"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-zinc-400">
              No results.
            </Command.Empty>
            <Command.Group
              heading="Actions"
              className="text-xs text-zinc-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
            >
              <Command.Item
                onSelect={() => {
                  router.push(buildParams(searchParams, { compose: "new" }));
                  setOpen(false);
                }}
                className="cursor-pointer rounded-md px-2 py-2 text-sm aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
              >
                Compose new message <span className="float-right text-zinc-400">c</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  router.push(buildParams(searchParams, { ask: "", thread: undefined }));
                  setOpen(false);
                }}
                className="cursor-pointer rounded-md px-2 py-2 text-sm aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
              >
                Ask my inbox <span className="float-right text-zinc-400">✦</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  void syncAllNow();
                  setOpen(false);
                }}
                className="cursor-pointer rounded-md px-2 py-2 text-sm aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
              >
                Sync all accounts
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  void connectMockAccount();
                  setOpen(false);
                }}
                className="cursor-pointer rounded-md px-2 py-2 text-sm aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
              >
                Add demo account & sync
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  router.push("/settings");
                  setOpen(false);
                }}
                className="cursor-pointer rounded-md px-2 py-2 text-sm aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
              >
                Open settings
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  router.push("/analytics");
                  setOpen(false);
                }}
                className="cursor-pointer rounded-md px-2 py-2 text-sm aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
              >
                Open analytics
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  setOpen(false);
                  window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
                }}
                className="cursor-pointer rounded-md px-2 py-2 text-sm aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
              >
                Keyboard shortcuts <span className="float-right text-zinc-400">?</span>
              </Command.Item>
            </Command.Group>
            <Command.Group
              heading="Views"
              className="text-xs text-zinc-400 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
            >
              {NAV_ITEMS.map((item) => (
                <Command.Item
                  key={item.view}
                  onSelect={() => go(item.view)}
                  className="cursor-pointer rounded-md px-2 py-2 text-sm aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
                >
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </div>
      </div>
    </Command.Dialog>
  );
}
