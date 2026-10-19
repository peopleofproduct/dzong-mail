export type {
  AccountSecrets,
  MailSyncProvider,
  ProviderSyncResult,
  RawMessage,
  SyncContext,
  SyncOutcome,
} from "./types";
export { encryptSecret, decryptSecret, decryptIfPresent } from "./crypto";
export { syncAccount, syncAllAccounts } from "./engine";
export {
  buildGoogleAuthorizationUrl,
  exchangeGoogleCode,
  refreshGoogleAccessToken,
  GOOGLE_MAIL_SCOPES,
} from "./oauth/google";
export {
  buildMicrosoftAuthorizationUrl,
  exchangeMicrosoftCode,
  refreshMicrosoftAccessToken,
  MICROSOFT_MAIL_SCOPES,
} from "./oauth/microsoft";
export type { OAuthClientConfig, OAuthTokens } from "./oauth/types";
export { MockSyncProvider } from "./providers/mock";
export { ImapSyncProvider } from "./providers/imap";
export { GmailSyncProvider } from "./providers/gmail";
export { GraphSyncProvider } from "./providers/graph";
