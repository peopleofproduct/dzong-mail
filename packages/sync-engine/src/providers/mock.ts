import type { MailSyncProvider, ProviderSyncResult, RawMessage, SyncContext } from "../types";

const BATCH_SIZE = 5;

/** Demo taxonomy per sender — the label spread a real inbox shows after
 *  sync + classification: provider category (Gmail-style), AI labels
 *  (violet chips), and user labels (emerald chips). Makes the demo list
 *  teach the tagging system instead of showing three flavors of bulk. */
export const MOCK_SENDERS: Array<{
  address: string;
  name: string;
  /** providerLabels — the provider's own category. */
  provider: string[];
  /** aiLabels — what the local classifier would decide. */
  ai: string[];
  /** labels — user/organization tags. */
  user: string[];
}> = [
  {
    address: "newsletter@changelog.com",
    name: "Changelog",
    provider: ["NEWSLETTER", "CATEGORY_UPDATES"],
    ai: ["NEWSLETTER"],
    user: ["Dev reads"],
  },
  {
    address: "billing@vercel.com",
    name: "Vercel Billing",
    provider: ["CATEGORY_UPDATES"],
    ai: ["RECEIPT", "ACTION_REQUIRED"],
    user: ["Billing"],
  },
  {
    address: "noreply@github.com",
    name: "GitHub",
    provider: ["CATEGORY_UPDATES"],
    ai: ["NOTIFICATION"],
    user: ["GitHub"],
  },
  {
    address: "alice@example.com",
    name: "Alice Hart",
    provider: ["INBOX"],
    ai: ["ACTION_REQUIRED"],
    user: ["VIP"],
  },
  {
    address: "team@linear.app",
    name: "Linear",
    provider: ["CATEGORY_UPDATES"],
    ai: ["NOTIFICATION", "ACTION_REQUIRED"],
    user: ["Team"],
  },
  {
    address: "digest@hackernews.com",
    name: "HN Digest",
    provider: ["NEWSLETTER"],
    ai: ["NEWSLETTER"],
    user: ["Dev reads"],
  },
  {
    address: "promos@wanderair.example.com",
    name: "Wander Air Deals",
    provider: ["CATEGORY_PROMOTIONS"],
    ai: ["MARKETING"],
    user: [],
  },
  {
    address: "updates@linkedin.example.com",
    name: "LinkedIn",
    provider: ["CATEGORY_SOCIAL"],
    ai: ["SOCIAL", "NOTIFICATION"],
    user: [],
  },
  {
    address: "sales@cloudpivot.example.com",
    name: "CloudPivot Sales",
    provider: ["CATEGORY_PROMOTIONS"],
    ai: ["COLD_PITCH", "MARKETING"],
    user: [],
  },
  {
    address: "receipts@railgo.example.com",
    name: "RailGo",
    provider: ["CATEGORY_UPDATES"],
    ai: ["RECEIPT"],
    user: ["Travel"],
  },
  {
    address: "calendar@dzong.local",
    name: "Calendar",
    provider: ["CATEGORY_UPDATES"],
    ai: ["NOTIFICATION", "ACTION_REQUIRED"],
    user: ["Calendar"],
  },
  {
    address: "mom@example.com",
    name: "Mom",
    provider: ["INBOX"],
    ai: [],
    user: ["Personal", "VIP"],
  },
];

const SUBJECTS = [
  "Your weekly digest is ready",
  "Invoice #1042 — payment received",
  "[dzong-mail] PR #12: Sync engine landed",
  "Re: Weekend hiking plans",
  "Sprint review moved to Thursday",
  "Top stories this morning",
  "Your receipt for April",
  "Comment on your pull request",
  "Coffee this week?",
  "Deploy finished: production",
];

const SNIPPETS = [
  "Here's what you missed while you were away…",
  "Thanks for your payment. Your receipt is attached below.",
  "New changes were pushed to the branch you are watching.",
  "Trail looks clear — meeting at the usual spot at 7am.",
  "Agenda attached. Please review the metrics before the meeting.",
];

const BODIES = [
  "Hey there,\n\nYour weekly digest is here with the stories you bookmarked and a few we think you'll like. This week: local-first software, the state of email protocols, and why inboxes broke.\n\n— The Digest Team\n\nUnsubscribe: https://digest.example.com/u/abc123",
  "Hi,\n\nThis confirms your payment of $49.00 for invoice #1042. A PDF receipt is attached for your records.\n\nThanks,\nVercel Billing\n\nUnsubscribe from receipts: https://billing.example.com/unsub",
  "A new commit was pushed to dzong-mail:\n\n  Add sync-engine package and wire end-to-end mail sync\n\nView it here: https://github.com/dzong/mail/pull/12",
  "Hey! The weather's looking great for Saturday. Still good for the 7am start at the usual trailhead? I'll bring coffee.\n\n— Alice",
  "Team —\n\nAgenda for Thursday's sprint review:\n  1. Sync engine demo\n  2. AI labeling roadmap\n  3. Open floor\n\nPlease skim the metrics doc before we meet.\n\n— PM",
];

/**
 * Deterministic local provider for development and demos. Each sync appends
 * a small batch of generated messages; syncToken is just a message counter.
 */
export class MockSyncProvider implements MailSyncProvider {
  async sync({ account }: SyncContext): Promise<ProviderSyncResult> {
    const generated = Number(account.syncToken ?? "0") || 0;
    const messages: RawMessage[] = [];

    for (let i = generated; i < generated + BATCH_SIZE; i++) {
      const sender = MOCK_SENDERS[i % MOCK_SENDERS.length];
      const subject = SUBJECTS[i % SUBJECTS.length];
      const threadId = `mock-thread-${Math.floor(i / 3)}`;
      messages.push({
        providerMessageId: `mock-${account.id}-${i}`,
        threadId,
        folder: i % 7 === 0 ? "Archive" : "INBOX",
        subject,
        snippet: SNIPPETS[i % SNIPPETS.length],
        fromAddress: sender.address,
        fromName: sender.name,
        toAddresses: [account.emailAddress],
        ccAddresses: [],
        bccAddresses: [],
        headers: {
          "Message-ID": `<mock-${i}@dzong.local>`,
          "X-Mailer": "Dzong Mock Provider",
          ...(sender.ai.includes("NEWSLETTER") || sender.ai.includes("MARKETING")
            ? {
                "List-Unsubscribe": `<https://dzong.local/unsub/${i}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              }
            : {}),
        },
        aiLabels: sender.ai,
        labels: sender.user,
        bodyText: BODIES[i % BODIES.length],
        attachments:
          i % 5 === 0
            ? [
                {
                  filename: `report-${1000 + i}.txt`,
                  mimeType: "text/plain",
                  content: Buffer.from(
                    `Mock attachment #${i}\n\nGenerated by the Dzong demo provider.\n`,
                  ),
                },
              ]
            : [],
        sizeBytes: 2048 + i * 37,
        receivedAt: new Date(Date.now() - i * 3 * 60 * 60 * 1000),
        isRead: i % 3 === 0,
        isStarred: i % 8 === 0,
        isDraft: false,
        providerLabels: sender.provider,
      });
    }

    return {
      messages,
      nextSyncToken: String(generated + BATCH_SIZE),
    };
  }
}
