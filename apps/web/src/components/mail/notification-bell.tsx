"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/actions";

interface Item {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  threadId: string | null;
  readAt: string | null;
  createdAt: string;
}

const POLL_MS = 30_000;
const DESKTOP_KEY = "unwalled-desktop-notify";
const PREF_EVENT = "unwalled-notify-pref";

const subscribePref = (cb: () => void) => {
  window.addEventListener(PREF_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PREF_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/**
 * Topbar bell: unread badge, dropdown of recent activity, and opt-in
 * desktop notifications mirrored through the Notification API. All data
 * comes from the local Notification table - nothing leaves the machine.
 */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const desktop = useSyncExternalStore(
    subscribePref,
    () => localStorage.getItem(DESKTOP_KEY) === "1",
    () => false,
  );
  const ref = useRef<HTMLDivElement>(null);
  const baseline = useRef<string | null>(null);

  // Poll the local notification log; fire desktop notifications for rows
  // newer than the baseline established on first load.
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/v1/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { unread: number; items: Item[] };
        setUnread(data.unread);
        setItems(data.items);
        if (baseline.current === null) {
          baseline.current = data.items[0]?.createdAt ?? new Date().toISOString();
          return;
        }
        if (desktop && typeof Notification !== "undefined" && Notification.permission === "granted") {
          for (const item of data.items) {
            if (item.createdAt > baseline.current) {
              new Notification(item.title, { body: item.body ?? undefined, tag: item.id });
            }
          }
        }
        baseline.current = data.items[0]?.createdAt ?? baseline.current;
      } catch {
        /* offline - next tick retries */
      }
    };
    void poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [desktop]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const enableDesktop = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    localStorage.setItem(DESKTOP_KEY, perm === "granted" ? "1" : "0");
    window.dispatchEvent(new Event(PREF_EVENT));
  };

  const open_ = async (item: Item) => {
    await markNotificationRead(item.id);
    setOpen(false);
    if (item.threadId) router.push(`/?thread=${item.threadId}`);
    else setUnread((u) => Math.max(0, u - 1));
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className="relative rounded-md p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        {unread > 0 ? <BellRing size={15} /> : <Bell size={15} />}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-bold text-white">
            {unread > 99 ? "99" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="anim-pop absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Activity</p>
            <div className="flex items-center gap-2">
              {!desktop && (
                <button
                  onClick={enableDesktop}
                  className="text-[11px] text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Enable desktop alerts
                </button>
              )}
              <button
                onClick={async () => {
                  await markAllNotificationsRead();
                  setUnread(0);
                  setItems((l) => l.map((i) => ({ ...i, readAt: new Date().toISOString() })));
                }}
                title="Mark all read"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <CheckCheck size={14} />
              </button>
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-3 py-6 text-center text-xs text-zinc-400">
                Nothing yet — activity appears as mail syncs.
              </li>
            )}
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => void open_(item)}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                    item.readAt ? "opacity-60" : ""
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-100">
                    {!item.readAt && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />}
                    {item.title}
                  </span>
                  {item.body && (
                    <span className="truncate pl-3 text-[11px] text-zinc-400">{item.body}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
