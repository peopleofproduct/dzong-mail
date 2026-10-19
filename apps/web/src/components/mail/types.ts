export interface MailItem {
  id: string;
  subject: string | null;
  snippet: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  receivedAt: string; // ISO
  isRead: boolean;
  isStarred: boolean;
  isDraft: boolean;
  isArchived: boolean;
  snoozedUntil: string | null;
  threadId: string | null;
  folder: string | null;
  providerLabels: string[];
  aiLabels: string[];
  labels: string[];
  accountEmail: string;
  hasUnsubscribe: boolean;
  hasAttachment: boolean;
  /** Semantic-search relevance score, present on `?sm=1` results. */
  score?: number;
}

export function serializeMessage(m: {
  id: string;
  subject: string | null;
  snippet: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
  isDraft: boolean;
  isArchived: boolean;
  snoozedUntil: Date | null;
  threadId: string | null;
  folder: string | null;
  providerLabels: string[];
  aiLabels: string[];
  labels: string[];
  headers: unknown;
  hasAttachment: boolean;
  emailAccount: { emailAddress: string };
}): MailItem {
  const headers = (m.headers ?? {}) as Record<string, string>;
  return {
    id: m.id,
    subject: m.subject,
    snippet: m.snippet,
    fromAddress: m.fromAddress,
    fromName: m.fromName,
    toAddresses: m.toAddresses,
    receivedAt: m.receivedAt.toISOString(),
    isRead: m.isRead,
    isStarred: m.isStarred,
    isDraft: m.isDraft,
    isArchived: m.isArchived,
    snoozedUntil: m.snoozedUntil?.toISOString() ?? null,
    threadId: m.threadId,
    folder: m.folder,
    providerLabels: m.providerLabels,
    aiLabels: m.aiLabels,
    labels: m.labels,
    accountEmail: m.emailAccount.emailAddress,
    hasUnsubscribe: Boolean(headers["List-Unsubscribe"] ?? headers["list-unsubscribe"]),
    hasAttachment: m.hasAttachment,
  };
}
