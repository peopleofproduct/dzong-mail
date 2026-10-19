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
export { sendEmail } from "./send";
export type { SendInput, SendResult } from "./send";
export {
  applyAutomationRules,
  matchesCondition,
  matchesRule,
  parseActions,
  parseConditions,
} from "./rules";
export type { RuleAction, RuleActionType, RuleCondition, RuleEvalResult } from "./rules";
export { classifyAccountMessages, DEFAULT_AI_LABELS } from "./classify";
export type { ClassifyOutcome } from "./classify";
export { unsubscribeMessage } from "./unsubscribe";
export type { UnsubscribeResult } from "./unsubscribe";
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
