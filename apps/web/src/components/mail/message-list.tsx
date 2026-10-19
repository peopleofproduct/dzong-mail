"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  BellOff,
  CheckCheck,
  Paperclip,
  Send,
  Star,
  X,
} from "lucide-react";
import {
  archiveMessages,
  markMessagesRead,
  moveMessages,
  sendDraftNow,
  snoozeMessage,
  toggleMessageFlag,
  unarchiveMessage,
  unarchiveMessages,
  unsnoozeMessage,
  unsubscribeFromMessage,
} from "@/lib/actions";
import { buildParams } from "./params";
import type { MailItem } from "./types";

export interface ListSection {
  title: string;
  ids: string[];
}

interface MessageListProps {
  messages: MailItem[];
  selectedId?: string;
  threadId?: string;
  /** Optional split-inbox groupings — renders collapsible headers between groups. */
  sections?: ListSection[];
}

export function MessageList({ messages, selectedId, threadId, sections }: MessageListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["Newsletters & bulk"]));
  const lastArchived = useRef<string[]>([]);
  const gPending = useRef(0);
  const vPending = useRef(0);

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

  const archive = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      lastArchived.current = ids;
      void archiveMessages(ids);
      setChecked(new Set());
    },
    [setChecked],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const now = Date.now();

      // v-chord: move to inbox/archive/trash
      if (e.key === "v") {
        vPending.current = now;
        return;
      }
      if (vPending.current && now - vPending.current < 1000) {
        vPending.current = 0;
        const ids = targets();
        if (e.key === "a") {
          archive(ids);
          return;
        }
        if (e.key === "i") {
          void moveMessages(ids, "inbox");
          return;
        }
        if (e.key === "t") {
          void moveMessages(ids, "trash");
          return;
        }
        // Unknown chord key — fall through to normal handling.
      }

      // g-chord: jump to top (the global g→view chords live in
      // KeyboardShortcuts; both listeners see the same keys harmlessly).
      if (e.key === "g") {
        gPending.current = now;
        return;
      }
      if (gPending.current && now - gPending.current < 1000 && e.key === "g") {
        gPending.current = 0;
        e.preventDefault();
        select(messages[0]?.id);
        return;
      }

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          move(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          move(-1);
          break;
        case "G":
          select(messages[messages.length - 1]?.id);
          break;
        case "Enter":
        case "o": {
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
        case "A":
          setChecked(new Set(messages.map((m) => m.id)));
          break;
        case "e":
          archive(targets());
          break;
        case "z":
          // Undo the most recent bulk archive.
          if (lastArchived.current.length > 0) {
            void unarchiveMessages(lastArchived.current);
            lastArchived.current = [];
          }
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
          // Clearing a multi-select takes priority over closing the thread —
          // the global handler in KeyboardShortcuts owns thread/compose close.
          if (checked.size > 0) {
            e.stopImmediatePropagation();
            setChecked(new Set());
          }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [messages, currentIndex, selectedId, move, openThread, targets, archive, select, checked]);

  const toggleSection = (title: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const renderRow = (m: MailItem) => {
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
            {m.hasAttachment && (
              <Paperclip size={11} className="shrink-0 text-zinc-400" aria-label="Has attachment" />
            )}
            {m.score !== undefined && (
              <span
                title="Semantic match score"
                className="shrink-0 rounded bg-indigo-50 px-1 text-[10px] font-medium text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
              >
                ✦ {m.score.toFixed(2)}
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
          {m.isDraft && (
            <button
              title="Send now"
              onClick={(e) => {
                e.stopPropagation();
                void sendDraftNow(m.id);
              }}
              className="rounded p-1 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-950"
            >
              <Send size={14} />
            </button>
          )}
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
                archive([m.id]);
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
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-zinc-400">
        Nothing here. Hit <kbd className="mx-1 rounded bg-zinc-100 px-1 dark:bg-zinc-800">⌘K</kbd>
        or sync an account.
      </div>
    );
  }

  const byId = new Map(messages.map((m) => [m.id, m]));

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {checked.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">
            {checked.size} selected
          </span>
          <button
            onClick={() => archive([...checked])}
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
      {sections && sections.length > 0 ? (
        sections.map((section) => {
          const isCollapsed = collapsed.has(section.title);
          const items = section.ids
            .map((id) => byId.get(id))
            .filter((m): m is MailItem => Boolean(m));
          return (
            <div key={section.title} className="border-b border-zinc-200 dark:border-zinc-800">
              <button
                onClick={() => toggleSection(section.title)}
                className="sticky top-0 z-[5] flex w-full items-center gap-2 bg-zinc-50/95 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase backdrop-blur dark:bg-zinc-900/95 dark:text-zinc-400"
              >
                <span className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`}>▾</span>
                {section.title}
                <span className="text-zinc-400 normal-case">({items.length})</span>
              </button>
              {!isCollapsed && (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {items.map(renderRow)}
                </ul>
              )}
            </div>
          );
        })
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
          {messages.map(renderRow)}
        </ul>
      )}
    </div>
  );
}
