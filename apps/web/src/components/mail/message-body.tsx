"use client";

import { useState } from "react";

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

/**
 * Renders one email body. Sanitized HTML when available (formatted like the
 * sender intended, in a light card so colours stay correct in dark mode),
 * otherwise plain text with quoted replies folded behind a toggle.
 */
export function MessageBody({
  html,
  text,
  fallback,
}: {
  html: string | null;
  text: string | null;
  fallback: string;
}) {
  const [showQuoted, setShowQuoted] = useState(false);

  if (html) {
    return (
      <div
        className="email-body rounded-lg bg-white p-4 text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  if (!text) {
    return <p className="text-sm text-zinc-500 italic">{fallback}</p>;
  }

  const { fresh, quoted } = splitQuoted(text);
  return (
    <div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
        {fresh}
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
              {quoted}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
