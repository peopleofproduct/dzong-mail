"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  RemoveFormatting,
  Strikethrough,
  Underline,
} from "lucide-react";

export interface RichBodyHandle {
  /** Insert HTML at the caret (snippets, templates). */
  insert: (html: string) => void;
  /** Replace the whole body (AI variant pick). */
  set: (html: string) => void;
}

interface RichBodyProps {
  initialHtml: string;
  /** Plain-text mirror for state consumers (draft save, variants, dirty check). */
  onTextChange: (text: string, html: string) => void;
  autoFocus?: boolean;
}

const btn =
  "rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";

/**
 * Dependency-free rich body: a contentEditable area with an execCommand
 * toolbar. Emits two mirrors — innerText for plain-text fallbacks and a
 * sanitized-ish innerHTML for multipart/alternative. Deliberately minimal:
 * formatting is optional polish, never a wall between the user and sending.
 */
export const RichBody = forwardRef<RichBodyHandle, RichBodyProps>(function RichBody(
  { initialHtml, onTextChange, autoFocus },
  handleRef,
) {
  const ref = useRef<HTMLDivElement>(null);
  const [showLink, setShowLink] = useState(false);

  // Mount once with initial content; we never re-paint innerHTML so the
  // user's caret never jumps.
  useEffect(() => {
    if (ref.current && initialHtml) ref.current.innerHTML = initialHtml;
    if (autoFocus) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sync = () => {
    if (!ref.current) return;
    onTextChange(ref.current.innerText, ref.current.innerHTML);
  };

  const cmd = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    sync();
  };

  useImperativeHandle(handleRef, () => ({
    insert: (html: string) => {
      ref.current?.focus();
      document.execCommand("insertHTML", false, html);
      sync();
    },
    set: (html: string) => {
      if (ref.current) {
        ref.current.innerHTML = html;
        sync();
      }
    },
  }));

  const addLink = (url: string) => {
    if (url) cmd("createLink", url);
    setShowLink(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-0.5 border-b border-zinc-100 px-3 py-1 dark:border-zinc-800/60">
        <button type="button" className={btn} title="Bold" onClick={() => cmd("bold")}>
          <Bold size={13} />
        </button>
        <button type="button" className={btn} title="Italic" onClick={() => cmd("italic")}>
          <Italic size={13} />
        </button>
        <button type="button" className={btn} title="Underline" onClick={() => cmd("underline")}>
          <Underline size={13} />
        </button>
        <button type="button" className={btn} title="Strikethrough" onClick={() => cmd("strikeThrough")}>
          <Strikethrough size={13} />
        </button>
        <span className="mx-1 h-3.5 w-px bg-zinc-200 dark:bg-zinc-700" />
        <button type="button" className={btn} title="Bulleted list" onClick={() => cmd("insertUnorderedList")}>
          <List size={13} />
        </button>
        <button type="button" className={btn} title="Numbered list" onClick={() => cmd("insertOrderedList")}>
          <ListOrdered size={13} />
        </button>
        <button type="button" className={btn} title="Insert link" onClick={() => setShowLink((v) => !v)}>
          <LinkIcon size={13} />
        </button>
        <button type="button" className={btn} title="Clear formatting" onClick={() => cmd("removeFormat")}>
          <RemoveFormatting size={13} />
        </button>
        {showLink && (
          <input
            autoFocus
            type="url"
            placeholder="https://…"
            className="ml-1 flex-1 rounded border border-zinc-200 bg-transparent px-1.5 py-0.5 text-xs focus:outline-none dark:border-zinc-700"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLink((e.target as HTMLInputElement).value);
              }
              if (e.key === "Escape") setShowLink(false);
            }}
            onBlur={(e) => addLink(e.target.value)}
          />
        )}
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Message body"
        data-placeholder="Write your message…"
        onInput={sync}
        className="composer-rich min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm text-black focus:outline-none empty:before:text-zinc-400 empty:before:content-[attr(data-placeholder)] dark:text-zinc-100"
      />
    </div>
  );
});
