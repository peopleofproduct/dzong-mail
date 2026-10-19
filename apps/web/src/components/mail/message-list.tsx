"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, BellOff, CheckCheck, Star, X } from "lucide-react";
import {
  archiveMessages,
  markMessagesRead,
  snoozeMessage,
  toggleMessageFlag,
  unarchiveMessage,
  unsnoozeMessage,
  unsubscribeFromMessage,
} from "@/lib/actions";
import { buildParams } from "./params";
import type { MailItem } from "./types";

interface MessageListProps {
  messages: MailItem[];
  selectedId?: string;
  threadId?: string;
}

export function MessageList({ messages, selectedId, threadId }: MessageListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const currentIndex = useMemo(
    () => messages.findIndex((m) => m.id === selectedId),
    [messages, selectedId],
  );

  const select = useCallback(
    (id: string | undefined) => {
      router.replace(buildParams(searchParams, { selected: id }), { scroll: false });
    },
    [router, searchParams],
  );

  const openThread = useCallback(
    (item: MailItem) => {
      router.push(
        buildParams(searchParams, {
          selected: item.id,
          thread: item.threadId ?? `single-${item.id}`,
        }),
      );
    },
    [router, searchParams],
  );

  const move = useCallback(
    (delta: number) => {
      const next = Math.min(Math.max(currentIndex + delta, 0), messages.length - 1);
      select(messages[next]?.id);
    },
    [currentIndex, messages, select],
  );

  const targets = useCallback(
    () => (checked.size > 0 ? [...checked] : selectedId ? [selectedId] : []),
    [checked, selectedId],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "j":
          e.preventDefault();
          move(1);
          break;
        case "k":
          e.preventDefault();
          move(-1);
          break;
        case "Enter": {
          const item = messages[currentIndex];
          if (item) openThread(item);
          break;
        }
        case "x": {
          if (!selectedId) break;
          setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(selectedId)) next.delete(selectedId);
            else next.add(selectedId);
            return next;
          });
          break;
        }
        case "e":
          void archiveMessages(targets());
          setChecked(new Set());
          break;
        case "s":
          if (selectedId) void toggleMessageFlag(selectedId, "isStarred");
          break;
        case "u":
          if (selectedId) void toggleMessageFlag(selectedId, "isRead");
          break;
        case "h":
          if (selectedId) void snoozeMessage(selectedId, 24);
          break;
        case "Escape":
          router.push(buildParams(searchParams, { thread: undefined }));
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [messages, currentIndex, selectedId, move, openThread, targets, router, searchParams]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-zinc-400">
        Nothing here. Hit <kbd className="mx-1 rounded bg-zinc-100 px-1 dark:bg-zinc-800">⌘K</kbd>
        or sync an account.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {checked.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">
            {checked.size} selected
          </span>
          <button
            onClick={() => void archiveMessages([...checked]).then(() => setChecked(new Set()))}
            className="rounded bg-zinc-900 px-2 py-1 text-white dark:bg-zinc-100 dark:text-black"
          >
            Archive
          </button>
          <button
            onClick={() => void markMessagesRead([...checked])}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700"
          >
            Mark read
          </button>
          <button
            onClick={() => setChecked(new Set())}
            className="ml-auto text-zinc-400 hover:text-zinc-600"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {messages.map((m) => {
          const isSelected = m.id === selectedId;
          const isChecked = checked.has(m.id);
          const isOpen = m.threadId ? m.threadId === threadId : false;
          return (
            <li
              key={m.id}
              onClick={() => {
                select(m.id);
                openThread(m);
              }}
              className={`group flex cursor-pointer items-start gap-2 px-3 py-2.5 ${
                isSelected || isOpen
                  ? "bg-indigo-50/60 dark:bg-indigo-950/30"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
              }`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => {
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (next.has(m.id)) next.delete(m.id);
                    else next.add(m.id);
                    return next;
                  });
                }}
                onClick={(e) => e.stopPropagation()}
                className="mt-1.5 h-3.5 w-3.5 accent-indigo-600"
                aria-label="Select message"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void toggleMessageFlag(m.id, "isStarred");
                }}
                aria-label="Star"
                className={`mt-1 shrink-0 ${
                  m.isStarred
                    ? "text-amber-500"
                    : "text-zinc-300 group-hover:text-zinc-400 dark:text-zinc-600"
                }`}
              >
                <Star size={14} fill={m.isStarred ? "currentColor" : "none"} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`truncate text-[13px] ${
                      m.isRead
                        ? "text-zinc-500 dark:text-zinc-400"
                        : "font-semibold text-zinc-900 dark:text-zinc-50"
                    }`}
                  >
                    {m.fromName ?? m.fromAddress}
                  </span>
                  {m.snoozedUntil && (
                    <span title={`Snoozed until ${new Date(m.snoozedUntil).toLocaleString()}`}>
                      <BellOff size={11} className="shrink-0 text-zinc-400" />
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[11px] text-zinc-400">
                    {new Date(m.receivedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <p
                  className={`truncate text-[13px] ${
                    m.isRead
                      ? "text-zinc-500 dark:text-zinc-400"
                      : "font-medium text-zinc-800 dark:text-zinc-200"
                  }`}
                >
                  {m.subject ?? "(no subject)"}
                </p>
                <p className="truncate text-xs text-zinc-400 dark:text-zinc-500">{m.snippet}</p>
                {(m.aiLabels.length > 0 || m.labels.length > 0) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.aiLabels.map((l) => (
                      <span
                        key={l}
                        className="rounded bg-indigo-100 px-1 py-px text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      >
                        {l}
                      </span>
                    ))}
                    {m.labels.map((l) => (
                      <span
                        key={l}
                        className="rounded bg-emerald-100 px-1 py-px text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
                {m.isArchived ? (
                  <button
                    title="Unarchive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void unarchiveMessage(m.id);
                    }}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <ArchiveRestore size={14} />
                  </button>
                ) : (
                  <button
                    title="Archive (e)"
                    onClick={(e) => {
                      e.stopPropagation();
                      void archiveMessages([m.id]);
                    }}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <Archive size={14} />
                  </button>
                )}
                {m.snoozedUntil ? (
                  <button
                    title="Unsnooze"
                    onClick={(e) => {
                      e.stopPropagation();
                      void unsnoozeMessage(m.id);
                    }}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <BellOff size={14} />
                  </button>
                ) : (
                  <button
                    title="Snooze 24h (h)"
                    onClick={(e) => {
                      e.stopPropagation();
                      void snoozeMessage(m.id, 24);
                    }}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <BellOff size={14} />
                  </button>
                )}
                <button
                  title={m.isRead ? "Mark unread (u)" : "Mark read (u)"}
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggleMessageFlag(m.id, "isRead");
                  }}
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  <CheckCheck size={14} />
                </button>
                {m.hasUnsubscribe && (
                  <button
                    title="Unsubscribe"
                    onClick={(e) => {
                      e.stopPropagation();
                      void unsubscribeFromMessage(m.id);
                    }}
                    className="rounded p-1 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
