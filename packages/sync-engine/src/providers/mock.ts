import type { MailSyncProvider, ProviderSyncResult, RawMessage, SyncContext } from "../types";

const BATCH_SIZE = 5;

const SENDERS: Array<{ address: string; name: string }> = [
  { address: "newsletter@changelog.com", name: "Changelog" },
  { address: "billing@vercel.com", name: "Vercel Billing" },
  { address: "noreply@github.com", name: "GitHub" },
  { address: "alice@example.com", name: "Alice Hart" },
  { address: "team@linear.app", name: "Linear" },
  { address: "digest@hackernews.com", name: "HN Digest" },
];

const SUBJECTS = [
  "Your weekly digest is ready",
  "Invoice #1042 — payment received",
  "[unwalled-mail] PR #12: Sync engine landed",
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

/**
 * Deterministic local provider for development and demos. Each sync appends
 * a small batch of generated messages; syncToken is just a message counter.
 */
export class MockSyncProvider implements MailSyncProvider {
  async sync({ account }: SyncContext): Promise<ProviderSyncResult> {
    const generated = Number(account.syncToken ?? "0") || 0;
    const messages: RawMessage[] = [];

    for (let i = generated; i < generated + BATCH_SIZE; i++) {
      const sender = SENDERS[i % SENDERS.length];
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
          "Message-ID": `<mock-${i}@unwalled.local>`,
          "X-Mailer": "Unwalled Mock Provider",
        },
        sizeBytes: 2048 + i * 37,
        receivedAt: new Date(Date.now() - i * 3 * 60 * 60 * 1000),
        isRead: i % 3 === 0,
        isStarred: i % 8 === 0,
        isDraft: false,
        providerLabels: i % 4 === 0 ? ["NEWSLETTER"] : ["INBOX"],
      });
    }

    return {
      messages,
      nextSyncToken: String(generated + BATCH_SIZE),
    };
  }
}
