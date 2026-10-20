import type { SemanticHit } from "./semantic";

export type AgentActionKind =
  | "archive"
  | "unarchive"
  | "mark_read"
  | "mark_unread"
  | "trash"
  | "label"
  | "unlabel"
  | "snooze"
  | "star"
  | "unstar"
  | "unsubscribe"
  | "draft_reply";

/** Extra data an action kind carries into the confirm card + executor. */
export interface ActionParams {
  /** Label name for label/unlabel. */
  label?: string;
  /** Snooze duration in hours. */
  hours?: number;
  /** Sender addresses for unsubscribe. */
  senders?: string[];
}

/** A mutation the assistant offers to run - always gated by user confirm. */
export interface ProposedAction {
  kind: AgentActionKind;
  /** Human sentence for the confirm card, e.g. "Archive these 12 messages". */
  label: string;
  messageIds: string[];
  /** First few rows so the user sees exactly what will change. */
  preview: { messageId: string; subject: string | null; from: string }[];
  /** True when messageIds was truncated to the safety cap. */
  truncated: boolean;
  params?: ActionParams;
  /** Honest caveat for partially irreversible actions, shown on the card. */
  caveat?: string;
}

const ACTION_CAP = 50;
const DRAFT_CAP = 5;
const UNSUB_SENDER_CAP = 10;

interface Intent {
  kind: AgentActionKind;
  re: RegExp;
  /** Keep only hits where the action would actually change something. */
  eligible: (hit: SemanticHit) => boolean;
}

/** Parse "snooze for 3 days / until tomorrow / until next week" to hours. */
function snoozeHours(question: string): number {
  const n = question.match(/for\s+(\d+)\s*(hour|day|week)/i);
  if (n) {
    const mult = { hour: 1, day: 24, week: 168 }[n[2].toLowerCase()] ?? 24;
    return Number(n[1]) * mult;
  }
  if (/\bnext week\b/i.test(question)) return 168;
  if (/\b(tonight|this evening)\b/i.test(question)) return 8;
  return 24; // "later", "tomorrow", bare "snooze these" all land at 24h
}

/** Extract a label name from "label these as receipts" / "tag with X". */
function labelName(question: string): string | null {
  const quoted = question.match(/(?:as|with|to)\s+"([^"]{1,30})"/i);
  const bare =
    quoted?.[1] ??
    question.match(/(?:as|with|to)\s+([a-zA-Z][\w -]{0,28}?)(?:\s*$|[.,!?]|\s+please)/i)?.[1] ??
    question.match(/(?:label|tag)\s+(?:the\s+)?"?([\w -]{1,30}?)"?(?:\s+label|\s*$)/i)?.[1];
  if (!bare) return null;
  const name = bare.trim().toUpperCase().replace(/\s+/g, "_").replace(/[^\w-]/g, "");
  return name || null;
}

/** Extract the label to remove from "remove the receipts label". */
function unlabelName(question: string): string | null {
  const m =
    question.match(/remove\s+(?:the\s+)?"?([\w -]{1,30}?)"?\s+label/i) ??
    question.match(/label\s+"?([\w -]{1,30}?)"?\s+(?:from|off)\b/i) ??
    question.match(/unlabel\s+(?:as\s+|with\s+)?"?([\w -]{1,30}?)"?(?:\s*$|[.,!?])/i);
  const raw = m?.[1]?.trim();
  if (!raw || /^(these|them|it|all|this|those)$/i.test(raw)) return labelName(question);
  return raw.toUpperCase().replace(/\s+/g, "_").replace(/[^\w-]/g, "") || null;
}

// Word-boundary regexes - \bread\b does not match inside "unread".
const INTENTS: Intent[] = [
  {
    kind: "unsubscribe",
    re: /\bunsubscribe\b/i,
    eligible: (h) => !h.message.isDraft,
  },
  {
    kind: "draft_reply",
    re: /\b(draft|write|compose)[\w\s]{0,20}\b(repl(y|ies)|response)s?\b|\breply to (these|them|all|this|those)\b/i,
    eligible: (h) => !h.message.isDraft && Boolean(h.message.threadId),
  },
  {
    kind: "mark_unread",
    re: /\bmark\b[\w\s]{0,40}\bunread\b|\bunread\b[\w\s]{0,15}\b(these|them|all|this|those)\b/i,
    eligible: (h) => h.message.isRead,
  },
  {
    kind: "trash",
    re: /\b(trash|delete|get rid of|bin)\b/i,
    eligible: (h) => h.message.folder !== "Trash",
  },
  {
    kind: "unarchive",
    re: /\b(unarchive|restore|bring back|move .{0,15}back to inbox)\b/i,
    eligible: (h) => h.message.isArchived,
  },
  {
    kind: "archive",
    re: /\b(archive|clear (out|up)|clean (up|out)|dismiss|file away|tidy up)\b/i,
    eligible: (h) => !h.message.isArchived,
  },
  {
    kind: "mark_read",
    re: /\bmark\b[\w\s]{0,40}\b(as )?read\b|\bread\b[\w\s]{0,15}\b(these|them|all|this|those)\b/i,
    eligible: (h) => !h.message.isRead,
  },
  {
    kind: "unlabel",
    re: /\b(unlabel|untag|remove\b[\w\s]{0,20}\blabel)\b/i,
    eligible: () => true, // narrowed by the parsed label below
  },
  {
    kind: "label",
    re: /\b(label|tag)\b/i,
    eligible: () => true,
  },
  {
    kind: "snooze",
    re: /\bsnooze\b|\bremind me .{0,20}\b(later|tomorrow|next week|tonight)\b|\b(these|them|all|this|those)\b[\w\s]{0,15}\blater\b/i,
    eligible: (h) => !h.message.isDraft,
  },
  {
    kind: "unstar",
    re: /\b(unstar|unflag|remove\b[\w\s]{0,15}\bstar)\b/i,
    eligible: (h) => h.message.isStarred,
  },
  {
    kind: "star",
    re: /\bstar\b|\bflag\b/i,
    eligible: (h) => !h.message.isStarred,
  },
];

const N = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function previewOf(hits: SemanticHit[]) {
  return hits.slice(0, 4).map((h) => ({
    messageId: h.message.id,
    subject: h.message.subject,
    from: h.message.fromName ?? h.message.fromAddress,
  }));
}

function base(
  kind: AgentActionKind,
  label: string,
  hits: SemanticHit[],
  extra: Partial<ProposedAction> = {},
): ProposedAction {
  return {
    kind,
    label,
    messageIds: hits.map((h) => h.message.id),
    preview: previewOf(hits),
    truncated: false,
    ...extra,
  };
}

/**
 * Turn a command-style question plus its cited findings into a concrete,
 * confirmable mutation. Read-only questions produce nothing; the proposal
 * always names the exact message set so the user can verify before running.
 */
export function proposeActions(
  question: string,
  hits: SemanticHit[],
): ProposedAction[] {
  const intent = INTENTS.find((i) => i.re.test(question));
  if (!intent) return [];

  const targets = hits.filter(intent.eligible);
  if (targets.length === 0) return [];

  switch (intent.kind) {
    case "unsubscribe": {
      const senders = [
        ...new Set(targets.map((h) => h.message.fromAddress)),
      ].slice(0, UNSUB_SENDER_CAP);
      if (senders.length === 0) return [];
      const ids = targets.filter((h) =>
        senders.includes(h.message.fromAddress),
      );
      return [
        base("unsubscribe", `Unsubscribe from ${N(senders.length, "sender")}`, ids, {
          params: { senders },
          caveat:
            "The unsubscribe request itself can't be undone - undo restores the archived mail only.",
          truncated: targets.length > ACTION_CAP,
        }),
      ];
    }
    case "draft_reply": {
      const capped = targets.slice(0, DRAFT_CAP);
      return [
        base("draft_reply", `Draft replies to ${N(capped.length, "thread")}`, capped, {
          truncated: targets.length > DRAFT_CAP,
        }),
      ];
    }
    case "label": {
      const name = labelName(question);
      if (!name) return [];
      const capped = targets.slice(0, ACTION_CAP);
      return [
        base("label", `Label ${N(capped.length, "message")} as ${name}`, capped, {
          params: { label: name },
          truncated: targets.length > ACTION_CAP,
        }),
      ];
    }
    case "unlabel": {
      const name = unlabelName(question);
      if (!name) return [];
      const tagged = targets.filter((h) => h.message.labels.includes(name));
      if (tagged.length === 0) return [];
      const capped = tagged.slice(0, ACTION_CAP);
      return [
        base("unlabel", `Remove the ${name} label from ${N(capped.length, "message")}`, capped, {
          params: { label: name },
          truncated: tagged.length > ACTION_CAP,
        }),
      ];
    }
    case "snooze": {
      const hours = snoozeHours(question);
      const capped = targets.slice(0, ACTION_CAP);
      const span =
        hours >= 168 ? `${Math.round(hours / 168)} week${hours > 168 ? "s" : ""}`
        : hours >= 24 ? `${Math.round(hours / 24)} day${hours > 24 ? "s" : ""}`
        : `${hours} hour${hours > 1 ? "s" : ""}`;
      return [
        base("snooze", `Snooze ${N(capped.length, "message")} for ${span}`, capped, {
          params: { hours },
          truncated: targets.length > ACTION_CAP,
        }),
      ];
    }
    case "star":
    case "unstar": {
      const capped = targets.slice(0, ACTION_CAP);
      return [
        base(
          intent.kind,
          `${intent.kind === "star" ? "Star" : "Unstar"} ${N(capped.length, "message")}`,
          capped,
          { truncated: targets.length > ACTION_CAP },
        ),
      ];
    }
    default: {
      const capped = targets.slice(0, ACTION_CAP);
      const verbs: Record<string, string> = {
        archive: `Archive ${N(capped.length, "message")}`,
        unarchive: `Move ${N(capped.length, "message")} back to inbox`,
        mark_read: `Mark ${N(capped.length, "message")} as read`,
        mark_unread: `Mark ${N(capped.length, "message")} as unread`,
        trash: `Move ${N(capped.length, "message")} to trash`,
      };
      return [
        base(intent.kind, verbs[intent.kind] ?? "Apply", capped, {
          truncated: targets.length > ACTION_CAP,
        }),
      ];
    }
  }
}
