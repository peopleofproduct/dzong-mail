"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import type { CleanedEmailHtml } from "@/lib/email-html";
import { trustRemoteSender } from "@/lib/actions";

/** Split a plain-text body into the fresh reply and the quoted history,
 *  the way Gmail folds "On … wrote:" sections out of view. */
function splitQuoted(text: string): { fresh: string; quoted: string | null } {
  const patterns = [
    /^On .{1,300}? wrote:$/m, // "On Jan 1, 2025, Alice <a@b> wrote:"
    /^_{3,}\s*$/m, // _______ separator
    /^-{3,}\s*Original Message\s*-{3,}\s*$/im,
    /^From:\s.*\n(?:Sent|Date):\s.*\nTo:\s/m, // Outlook-style header block
  ];
  for (const re of patterns) {
    const idx = text.search(re);
    if (idx > 0) return { fresh: text.slice(0, idx).trimEnd(), quoted: text.slice(idx) };
  }
  // Fallback: a tail of consecutive "> " quote lines.
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith(">"));
  if (start > 0 && lines.slice(start).every((l) => l.startsWith(">") || l.trim() === "")) {
    return {
      fresh: lines.slice(0, start).join("\n").trimEnd(),
      quoted: lines.slice(start).join("\n"),
    };
  }
  return { fresh: text, quoted: null };
}

const URL_SPLIT = /(\b(?:https?:\/\/|mailto:)[^\s<>()]+[^\s<>().,;:!?"'\]])/g;

/** Turn bare URLs in plain text into anchors — text bodies should still
 *  read like mail, not like a log dump. */
function linkify(text: string): ReactNode[] {
  return text.split(URL_SPLIT).map((part, i) =>
    /^(?:https?:\/\/|mailto:)/.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-500 dark:text-indigo-400"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}

/**
 * Renders one email body. Sanitized HTML when available (formatted like the
 * sender intended, in a light card so colours stay correct in dark mode),
 * otherwise plain text with quoted replies folded behind a toggle and bare
 * URLs linkified.
 *
 * Remote images/CSS never load until an explicit opt-in — tracking pixels
 * can't phone home just because a message was read. Three levels: the
 * per-message "Load images", a per-sender allowlist ("Always trust
 * sender"), and a global Settings toggle — the last two arrive here as
 * `remoteAllowed` and render remote content silently.
 */
export function MessageBody({
  html,
  text,
  fallback,
  senderAddress,
  remoteAllowed = false,
}: {
  html: CleanedEmailHtml | null;
  text: string | null;
  fallback: string;
  /** From address — enables the "Always trust sender" allowlist button. */
  senderAddress?: string | null;
  /** Global toggle or sender allowlist already permits remote loads. */
  remoteAllowed?: boolean;
}) {
  const [showQuoted, setShowQuoted] = useState(false);
  const [showRemote, setShowRemote] = useState(remoteAllowed);
  const [trustPending, startTrust] = useTransition();

  if (html) {
    return (
      <div>
        {html.hasRemoteContent && !remoteAllowed && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span aria-hidden>🛡</span>
            {showRemote ? (
              <span>Remote content loaded for this message.</span>
            ) : (
              <>
                <span>Remote images &amp; content blocked.</span>
                <button
                  type="button"
                  onClick={() => setShowRemote(true)}
                  className="rounded-md border border-zinc-300 px-2 py-0.5 font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Load images
                </button>
                {senderAddress && (
                  <button
                    type="button"
                    disabled={trustPending}
                    onClick={() =>
                      startTrust(async () => {
                        await trustRemoteSender(senderAddress);
                        setShowRemote(true);
                      })
                    }
                    className="rounded-md border border-zinc-300 px-2 py-0.5 font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    title={`Always load remote content from ${senderAddress}`}
                  >
                    {trustPending ? "Trusting…" : "Always trust sender"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
        <div
          className="email-body rounded-lg bg-white p-4 text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700"
          dangerouslySetInnerHTML={{
            __html: showRemote ? html.htmlWithRemote : html.html,
          }}
        />
      </div>
    );
  }

  if (!text) {
    return <p className="text-sm text-zinc-500 italic">{fallback}</p>;
  }

  const { fresh, quoted } = splitQuoted(text);
  return (
    <div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
        {linkify(fresh)}
      </p>
      {quoted && (
        <div className="mt-2">
          <button
            onClick={() => setShowQuoted((v) => !v)}
            title={showQuoted ? "Hide quoted text" : "Show quoted text"}
            className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            ···
          </button>
          {showQuoted && (
            <p className="mt-2 border-l-2 border-zinc-200 pl-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              {linkify(quoted)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
