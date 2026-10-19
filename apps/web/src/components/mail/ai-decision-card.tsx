"use client";

import { useState, useTransition } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { reviewDecision } from "@/lib/actions";

export interface DecisionView {
  id: string;
  kind: string;
  action: string;
  reason: string | null;
  confidence: number | null;
  status: string;
}

/**
 * Explainable-AI card: what the local model did to this message, why it
 * said so, and (for low-confidence calls) approve/reject buttons that
 * apply or discard the decision.
 */
export function AiDecisionCard({ decision }: { decision: DecisionView }) {
  const [state, setState] = useState(decision.status);
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);

  const act = (approve: boolean) =>
    start(async () => {
      try {
        await reviewDecision(decision.id, approve);
        setState(approve ? "applied" : "rejected");
      } catch {
        setError(true);
      }
    });

  const pct =
    decision.confidence !== null ? Math.round(decision.confidence * 100) : null;

  return (
    <div className="mx-5 mb-3 flex items-start gap-2 rounded-md border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs dark:border-indigo-900 dark:bg-indigo-950/30">
      <Sparkles size={13} className="mt-0.5 shrink-0 text-indigo-500" />
      <div className="min-w-0 flex-1">
        <span className="font-medium text-indigo-800 dark:text-indigo-200">
          {decision.kind === "label" ? "Labeled" : decision.kind === "rule" ? "Rule" : "AI"}:{" "}
          {decision.action}
        </span>
        {pct !== null && (
          <span className="ml-1.5 text-indigo-500 dark:text-indigo-400">{pct}% sure</span>
        )}
        {decision.reason && (
          <p className="mt-0.5 text-indigo-700/80 dark:text-indigo-300/70">{decision.reason}</p>
        )}
        {state === "rejected" && (
          <p className="mt-0.5 text-zinc-400">Dismissed - labels were not applied.</p>
        )}
      </div>
      {state === "queued" && (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => act(true)}
            title="Apply this decision"
            className="rounded bg-indigo-600 p-1 text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => act(false)}
            title="Reject"
            className="rounded border border-indigo-300 p-1 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
          >
            <X size={12} />
          </button>
        </span>
      )}
      {error && <span className="text-[10px] text-red-500">failed</span>}
    </div>
  );
}
