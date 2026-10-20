import { prisma } from "@dzong/database";
import type { Message, PrismaClient } from "@dzong/database";

/**
 * Per-recipient voice/tone intelligence.
 *
 * Everything here is derived deterministically from the local store - no
 * model call, no network. The profile feeds two surfaces:
 *   1. draft prompts ("write the way the user writes TO this person")
 *   2. the relationship dossier + smart categorization
 */

export interface RecipientStyle {
  address: string;
  /** How the user writes to this person. */
  myGreeting: string | null;
  mySignoff: string | null;
  myMedianWords: number | null;
  myFormality: "formal" | "neutral" | "casual" | null;
  /** How they write back. */
  theirGreeting: string | null;
  theirMedianWords: number | null;
  theirFormality: "formal" | "neutral" | "casual" | null;
  /** Relationship metadata. */
  exchanged: number;
  category: SenderCategory;
  /** Enough history to trust the profile (>= 3 exchanges each way). */
  confident: boolean;
}

export type SenderCategory =
  | "inner-circle" // frequent, fast, informal back-and-forth
  | "professional" // regular, formal-ish exchanges
  | "transactional" // receipts, bookings, automated-but-personal
  | "broadcast" // newsletters/marketing - they never reply
  | "dormant"; // used to correspond, gone quiet

// Captures the greeting word(s) plus an optional name that follows.
const GREETING_RE =
  /^(?:hi|hello|hey|dear|good\s(?:morning|afternoon|evening)|yo|namaste)[\s,]*(\w+)?/i;
const SIGNOFF_RE =
  /(?:^|\n)\s*(?:best(?:\s+regards|\s+wishes)?|thanks(?:\s+(?:again|so much))?|thank you|regards|cheers|warm(?:ly| regards)?|sincerely|kind regards|talk soon|see you|take care|yours|love)[,.!\s]*(?:\n\s*[A-Z][\w ]*)?$/im;

function firstLine(text: string): string {
  return text.trimStart().split("\n", 1)[0]?.trim() ?? "";
}

function greetingOf(text: string): string | null {
  const line = firstLine(text);
  if (line.length === 0 || line.length > 60) return null;
  const m = GREETING_RE.exec(line);
  if (!m) return null;
  // "hey sam, sounds good" -> "hey sam"; "hey" alone stays "hey".
  return (
    m[0]
      .replace(/[\s,]+$/, "")
      .replace(/\s*,\s*/, " ")
      .trim() || null
  );
}

function signoffOf(text: string): string | null {
  const tail = text.trimEnd().split("\n").slice(-4).join("\n");
  const m = SIGNOFF_RE.exec(tail);
  if (!m) return null;
  const line = m[0].split("\n").find((l) => l.trim().length > 0);
  return (
    line
      ?.trim()
      .replace(/[,.!]+$/, "")
      .slice(0, 30) || null
  );
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Crude formality read: contractions + exclamations + emoji pull casual;
 * long sentences and formal sign-offs pull formal.
 */
function formalityOf(texts: string[]): "formal" | "neutral" | "casual" | null {
  if (texts.length === 0) return null;
  const joined = texts.join("\n").toLowerCase();
  let score = 0;
  const casualMarks = (joined.match(/n't|'re|'ll|'ve|'d\b|!|😀|😊|👍|🙏|lol|haha|\bhey\b/g) ?? [])
    .length;
  const formalMarks = (
    joined.match(/\b(regards|sincerely|furthermore|regarding|pursuant|kindly)\b/g) ?? []
  ).length;
  score += casualMarks - formalMarks * 2;
  if (score >= 3) return "casual";
  if (score <= -2) return "formal";
  return "neutral";
}

function mode<T>(xs: (T | null)[]): T | null {
  const counts = new Map<T, number>();
  for (const x of xs) if (x !== null) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: T | null = null;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function bodyOf(m: Message): string {
  return m.bodyText ?? m.snippet ?? "";
}

const BROADCAST_LABELS = new Set([
  "NEWSLETTER",
  "MARKETING",
  "COLD_PITCH",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_SOCIAL",
]);

/**
 * Build (or rebuild) the style profile for one correspondent as seen from
 * `account`. Two bounded queries; safe to call per draft.
 */
export async function getRecipientStyle(
  recipientAddress: string,
  accountId: string,
  db: PrismaClient = prisma,
): Promise<RecipientStyle | null> {
  const account = await db.emailAccount.findUnique({ where: { id: accountId } });
  if (!account) return null;
  const me = account.emailAddress.toLowerCase();
  const addr = recipientAddress.toLowerCase();

  const [mine, theirs] = await Promise.all([
    db.message.findMany({
      where: {
        emailAccountId: accountId,
        isDraft: false,
        fromAddress: { equals: me, mode: "insensitive" },
        toAddresses: { hasSome: [addr, recipientAddress] },
      },
      orderBy: { receivedAt: "desc" },
      take: 50,
    }),
    db.message.findMany({
      where: {
        emailAccountId: accountId,
        isDraft: false,
        fromAddress: { equals: addr, mode: "insensitive" },
      },
      orderBy: { receivedAt: "desc" },
      take: 50,
    }),
  ]);

  const exchanged = mine.length + theirs.length;
  if (exchanged === 0) return null;

  const myTexts = mine.map(bodyOf).filter((t) => t.length > 0);
  const theirTexts = theirs.map(bodyOf).filter((t) => t.length > 0);

  // Category: broadcast when they write plenty but never get a reply;
  // dormant when nothing in 180d; transactional on receipt-ish labels;
  // inner-circle on frequent informal exchange; else professional.
  const latest = theirs[0]?.receivedAt;
  const dormant = !latest || Date.now() - latest.getTime() > 180 * 86400000;
  // One stray reply to a newsletter shouldn't disqualify it - use a ratio.
  const oneWay = theirs.length >= 3 && mine.length <= Math.max(1, theirs.length * 0.1);
  const broadcastish =
    oneWay &&
    theirs.some((m) => [...m.aiLabels, ...m.providerLabels].some((l) => BROADCAST_LABELS.has(l)));
  const transactional =
    oneWay &&
    theirs.some((m) =>
      [...m.aiLabels, ...m.providerLabels].some((l) =>
        ["RECEIPT", "NOTIFICATION", "CATEGORY_UPDATES"].includes(l),
      ),
    );
  const informal = formalityOf(theirTexts) === "casual" || formalityOf(myTexts) === "casual";
  const category: SenderCategory = broadcastish
    ? "broadcast"
    : dormant
      ? "dormant"
      : transactional
        ? "transactional"
        : mine.length >= 3 && exchanged >= 6 && informal
          ? "inner-circle"
          : "professional";

  return {
    address: recipientAddress,
    myGreeting: mode(myTexts.map(greetingOf)),
    mySignoff: mode(myTexts.map(signoffOf)),
    myMedianWords: median(myTexts.map(wordCount)),
    myFormality: formalityOf(myTexts),
    theirGreeting: mode(theirTexts.map(greetingOf)),
    theirMedianWords: median(theirTexts.map(wordCount)),
    theirFormality: formalityOf(theirTexts),
    exchanged,
    category,
    confident: mine.length >= 3 && theirs.length >= 3,
  };
}

/**
 * One-paragraph prompt fragment telling the model how the user actually
 * writes to this recipient. Returns "" when there's nothing to teach.
 */
export function stylePromptFragment(style: RecipientStyle | null): string {
  if (!style) return "";
  const hints: string[] = [];
  if (style.myGreeting) hints.push(`open with "${style.myGreeting}"`);
  if (style.myMedianWords !== null && style.myMedianWords < 200) {
    hints.push(`keep it around ${Math.max(10, style.myMedianWords)} words`);
  }
  if (style.myFormality === "casual") hints.push("use a casual tone");
  if (style.myFormality === "formal") hints.push("keep a formal tone");
  if (style.mySignoff) hints.push(`sign off "${style.mySignoff}"`);
  if (hints.length === 0) return "";
  return (
    ` When writing to ${style.address}, mirror how the user writes to them - ` +
    hints.join(", ") +
    "."
  );
}
