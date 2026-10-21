import { AudioLines } from "lucide-react";
import type { RecipientStyle } from "@dzong/sync-engine";

/**
 * "In your voice" proof badge for AI drafts. The style profile is built
 * deterministically from sent history, so the badge can *show its work* —
 * the learned greeting, length, tone and sign-off — instead of just
 * claiming voice-matching like hosted assistants do.
 */
export function VoiceBadge({ style }: { style: RecipientStyle | null }) {
  if (!style) return null;
  const hints: string[] = [];
  if (style.myGreeting) hints.push(`opens "${style.myGreeting}"`);
  if (style.myMedianWords !== null && style.myMedianWords < 200) {
    hints.push(`~${Math.max(10, style.myMedianWords)} words`);
  }
  if (style.myFormality && style.myFormality !== "neutral") {
    hints.push(`${style.myFormality} tone`);
  }
  if (style.mySignoff) hints.push(`signs off "${style.mySignoff}"`);

  if (hints.length === 0) return null;

  return (
    <details className="group/voice mt-1.5 text-[11px]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-violet-600 select-none dark:text-violet-400">
        <AudioLines size={11} />
        in your voice
        <span className="text-violet-400/70 transition-transform group-open/voice:rotate-180 dark:text-violet-500/70">
          ▾
        </span>
      </summary>
      <p className="mt-1 leading-relaxed text-violet-600/80 dark:text-violet-400/80">
        Learned from {style.exchanged} exchange{style.exchanged === 1 ? "" : "s"} with this
        person{style.confident ? "" : " — still learning"}: {hints.join(" · ")}.
      </p>
    </details>
  );
}
