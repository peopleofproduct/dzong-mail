import type { EmailAccount } from "@unwalled/database";

/** Provider-agnostic normalized message, ready for persistence. */
export interface RawMessage {
  providerMessageId: string;
  threadId?: string;
  folder?: string;
  subject?: string;
  snippet?: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  headers?: Record<string, string>;
  bodyText?: string;
  bodyHtml?: string;
  sizeBytes?: number;
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
  isDraft: boolean;
  providerLabels: string[];
}

/** Decrypted secrets for the account being synced. Populated by the engine. */
export interface AccountSecrets {
  password?: string;
  oauthAccessToken?: string;
  oauthRefreshToken?: string;
}

export interface SyncContext {
  account: EmailAccount;
  secrets: AccountSecrets;
}

export interface ProviderSyncResult {
  messages: RawMessage[];
  /** Provider-specific cursor to persist on the account for the next run. */
  nextSyncToken?: string;
}

/** Strategy for pulling raw messages from a mail backend. */
export interface MailSyncProvider {
  sync(ctx: SyncContext): Promise<ProviderSyncResult>;
}

export interface SyncOutcome {
  accountId: string;
  fetched: number;
  inserted: number;
  updated: number;
  nextSyncToken?: string;
}
