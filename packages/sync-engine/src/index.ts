export type {
  AccountSecrets,
  MailSyncProvider,
  ProviderSyncResult,
  RawMessage,
  SyncContext,
  SyncOutcome,
} from "./types";
export { encryptSecret, decryptSecret, decryptIfPresent } from "./crypto";
export { textToHtml } from "./text-html";
export { syncAccount, syncAllAccounts } from "./engine";
export { sendEmail, dispatchScheduledDraft } from "./send";
export type { SendAttachment, SendInput, SendResult } from "./send";
export { dispatchDueDrafts, returnDueSnoozes, runSyncCycle } from "./worker";
export { startIdleWatchers } from "./idle";
export { runPostSync } from "./post-sync";
export { MOCK_SENDERS } from "./providers/mock";
export type { PostSyncStats } from "./post-sync";
export {
  askInbox,
  embedAccountMessages,
  generateDigest,
  semanticSearchMessages,
  lexicalSearchMessages,
  cosineSimilarity,
} from "./semantic";
export type { EmbedOutcome, SemanticHit, AskResult } from "./semantic";
export { proposeActions } from "./agent";
export type { AgentActionKind, ProposedAction, ActionParams } from "./agent";
export { listRoutines, saveRoutine, deleteRoutine, runDueRoutines } from "./routines";
export type { Routine } from "./routines";
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
export { attemptUnsubscribe, unsubscribeMessage, unsubscribeSender } from "./unsubscribe";
export type { SenderUnsubscribeResult, UnsubscribeResult } from "./unsubscribe";
export { resolveAIForAccount, resolveAIForUser } from "./ai";
export type { ResolvedAI } from "./ai";
export {
  composeVariantsWithAI,
  composeWithAI,
  createDraftRow,
  draftAiReply,
  generateReplyVariants,
  generateRuleFromPrompt,
  saveReplyDraft,
  summarizeThread,
} from "./drafts";
export type { DraftResult, GeneratedRule, ReplyVariant } from "./drafts";
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
export { attachmentFilePath, attachmentsDir, dataDir, storeAttachmentContent } from "./attachments";
export { getRecipientStyle, stylePromptFragment } from "./style";
export type { RecipientStyle, SenderCategory } from "./style";
export { checkFollowUpReminders, emit, notifyNewMail, recordAgentRun } from "./notify";
export { importMailFiles, getOrCreateImportAccount } from "./import-mail";
export type { ImportResult } from "./import-mail";
export { verifyAccount, verifyAllAccounts } from "./verify";
export type { VerifyOutcome } from "./verify";
export { vectorIndexReady, indexEmbedding, searchIndex } from "./vector-index";
export type { IndexedHit } from "./vector-index";
