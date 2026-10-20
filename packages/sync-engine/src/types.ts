import type { EmailAccount } from "@dzong/database";

/** Provider-agnostic attachment: metadata plus content when the provider
 * returned it inline. Persisted to local disk by the engine. */
export interface RawAttachment {
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  /** cid: identifier for inline (embedded image) attachments. */
  contentId?: string;
  content?: Buffer;
}

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
  attachments?: RawAttachment[];
  sizeBytes?: number;
  receivedAt: Date;
  isRead: boolean;
  isStarred: boolean;
  isDraft: boolean;
  /** Archived state when the provider models it explicitly (Gmail INBOX
   *  label removal, etc.). Undefined = leave the local flag untouched. */
  isArchived?: boolean;
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
  /** Provider message ids deleted server-side since the last sync —
   *  the engine removes the corresponding local rows. */
  deletedProviderIds?: string[];
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
  /** Db ids of the newly inserted messages — post-sync (classification,
   *  notifications) needs them to scope its work to this batch. */
  insertedIds: string[];
  updated: number;
  /** Messages deleted locally because the provider reported them removed. */
  deleted?: number;
  nextSyncToken?: string;
}
