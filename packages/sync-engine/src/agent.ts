import type { SemanticHit } from "./semantic";

export type AgentActionKind =
  | "archive"
  | "unarchive"
  | "mark_read"
  | "mark_unread"
  | "trash";

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
}

const ACTION_CAP = 50;

interface Intent {
  kind: AgentActionKind;
  re: RegExp;
  /** Keep only hits where the action would actually change something. */
  eligible: (hit: SemanticHit) => boolean;
  verb: (n: number) => string;
}

// Word-boundary regexes - \bread\b does not match inside "unread".
const INTENTS: Intent[] = [
  {
    kind: "mark_unread",
    re: /\bmark\b[\w\s]{0,40}\bunread\b|\bunread\b[\w\s]{0,15}\b(these|them|all|this|those)\b/i,
    eligible: (h) => h.message.isRead,
    verb: (n) => `Mark ${n} ${n === 1 ? "message" : "messages"} as unread`,
  },
  {
    kind: "trash",
    re: /\b(trash|delete|get rid of|bin)\b/i,
    eligible: (h) => h.message.folder !== "Trash",
    verb: (n) => `Move ${n} ${n === 1 ? "message" : "messages"} to trash`,
  },
  {
    kind: "archive",
    re: /\b(archive|clear (out|up)|clean (up|out)|dismiss|file away|tidy up)\b/i,
    eligible: (h) => !h.message.isArchived,
    verb: (n) => `Archive ${n} ${n === 1 ? "message" : "messages"}`,
  },
  {
    kind: "mark_read",
    re: /\bmark\b[\w\s]{0,40}\b(as )?read\b|\bread\b[\w\s]{0,15}\b(these|them|all|this|those)\b/i,
    eligible: (h) => !h.message.isRead,
    verb: (n) => `Mark ${n} ${n === 1 ? "message" : "messages"} as read`,
  },
  {
    kind: "unarchive",
    re: /\b(unarchive|restore|bring back|move .{0,15}back to inbox)\b/i,
    eligible: (h) => h.message.isArchived,
    verb: (n) => `Move ${n} ${n === 1 ? "message" : "messages"} back to inbox`,
  },
];

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

  const capped = targets.slice(0, ACTION_CAP);
  return [
    {
      kind: intent.kind,
      label: intent.verb(capped.length),
      messageIds: capped.map((h) => h.message.id),
      preview: capped.slice(0, 4).map((h) => ({
        messageId: h.message.id,
        subject: h.message.subject,
        from: h.message.fromName ?? h.message.fromAddress,
      })),
      truncated: targets.length > ACTION_CAP,
    },
  ];
}
