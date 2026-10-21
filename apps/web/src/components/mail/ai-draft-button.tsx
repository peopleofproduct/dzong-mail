"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { generateReplyVariantsNow, saveReplyDraftNow } from "@/lib/actions";
import { VariantPicker } from "./variant-picker";
import type { DraftVariant } from "./variant-picker";

/**
 * "Draft reply with AI" — generates three styled variants, opens a picker so
 * the user reads and chooses, then persists the chosen body as the thread
 * draft (which then shows in the reply preview).
 */
export function AiDraftButton({
  messageId,
  className = "",
}: {
  messageId: string;
  className?: string;
}) {
  const [variants, setVariants] = useState<DraftVariant[] | null>(null);
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy("gen");
    setError(null);
    const r = await generateReplyVariantsNow(messageId);
    setBusy(null);
    if (r.ok && r.variants && r.variants.length > 0) {
      setVariants(r.variants);
    } else {
      setError(r.reason ?? "AI failed to draft a reply");
    }
  };

  const pick = async (body: string) => {
    setBusy("save");
    setError(null);
    const r = await saveReplyDraftNow(messageId, body);
    setBusy(null);
    if (r.ok) {
      setVariants(null);
    } else {
      setError(r.reason ?? "Could not save the draft");
    }
  };

  return (
    <>
      <button type="button" onClick={generate} disabled={busy !== null} className={className}>
        <Sparkles size={14} />
        {busy === "gen" ? "Drafting 3 versions…" : "Draft reply with AI"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}

      {variants && (
        <VariantPicker
          variants={variants}
          busy={busy !== null}
          generating={busy === "gen"}
          pickLabel={busy === "save" ? "Saving…" : "Use this draft"}
          onPick={pick}
          onRegenerate={generate}
          onClose={() => setVariants(null)}
        />
      )}
    </>
  );
}
