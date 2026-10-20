import { prisma } from "@dzong/database";
import type { EmailAccount, PrismaClient } from "@dzong/database";
import { persistAttachments } from "./attachments";
import { flagReadReceipts, ingestCalendarEvents } from "./ingest-extras";
import { decryptIfPresent, decryptSecret, encryptSecret } from "./crypto";
import { refreshGoogleAccessToken } from "./oauth/google";
import { refreshMicrosoftAccessToken } from "./oauth/microsoft";
import { applyAutomationRules } from "./rules";
import { GmailSyncProvider } from "./providers/gmail";
import { GraphSyncProvider } from "./providers/graph";
import { ImapSyncProvider } from "./providers/imap";
import { MockSyncProvider } from "./providers/mock";
import type { AccountSecrets, MailSyncProvider, RawMessage, SyncOutcome } from "./types";

function providerFor(account: EmailAccount): MailSyncProvider {
  switch (account.provider) {
    case "MOCK":
      return new MockSyncProvider();
    case "IMAP_SMTP":
      return new ImapSyncProvider();
    case "GOOGLE":
      return new GmailSyncProvider();
    case "MICROSOFT":
      return new GraphSyncProvider();
    case "IMPORTED":
      throw new Error("Imported accounts hold local mail only - nothing to sync");
    default: {
      const exhaustive: never = account.provider;
      throw new Error(`No sync provider for ${String(exhaustive)}`);
    }
  }
}

const REFRESH_MARGIN_MS = 60_000;

/**
 * Decrypted secrets for sync, with proactive OAuth refresh: access tokens
 * die after ~1h on both Google and Microsoft, so when the stored token is
 * within a minute of expiry we refresh it first and persist the result —
 * keeping the connected session alive without any user interaction.
 */
async function secretsFor(account: EmailAccount, db: PrismaClient): Promise<AccountSecrets> {
  const secrets: AccountSecrets = {
    password: decryptIfPresent(account.passwordEncrypted),
    oauthAccessToken: decryptIfPresent(account.oauthAccessToken),
    oauthRefreshToken: decryptIfPresent(account.oauthRefreshToken),
  };

  const refresh =
    account.provider === "GOOGLE"
      ? refreshGoogleAccessToken
      : account.provider === "MICROSOFT"
        ? refreshMicrosoftAccessToken
        : null;
  const { oauthClientId, oauthClientSecret, oauthTokenExpiresAt } = account;
  const { oauthRefreshToken } = secrets;

  const expiring =
    refresh !== null &&
    oauthRefreshToken !== undefined &&
    oauthClientId !== null &&
    oauthClientSecret !== null &&
    oauthTokenExpiresAt !== null &&
    oauthTokenExpiresAt.getTime() < Date.now() + REFRESH_MARGIN_MS;

  if (!expiring) return secrets;

  try {
    const tokens = await refresh(
      { clientId: oauthClientId, clientSecret: decryptSecret(oauthClientSecret) },
      oauthRefreshToken,
    );
    await db.emailAccount.update({
      where: { id: account.id },
      data: {
        oauthAccessToken: encryptSecret(tokens.accessToken),
        oauthRefreshToken: tokens.refreshToken
          ? encryptSecret(tokens.refreshToken)
          : account.oauthRefreshToken,
        oauthTokenExpiresAt: tokens.expiresAt,
      },
    });
    secrets.oauthAccessToken = tokens.accessToken;
    if (tokens.refreshToken) secrets.oauthRefreshToken = tokens.refreshToken;
  } catch (err) {
    // Fall through with the old token — the provider call will surface the
    // auth error, and the next sync retries the refresh.
    console.error(`[sync] OAuth refresh failed for account ${account.id}:`, err);
  }
  return secrets;
}

function toCreateInput(accountId: string, msg: RawMessage) {
  return {
    emailAccountId: accountId,
    providerMessageId: msg.providerMessageId,
    threadId: msg.threadId,
    folder: msg.folder,
    subject: msg.subject,
    snippet: msg.snippet,
    fromAddress: msg.fromAddress,
    fromName: msg.fromName,
    toAddresses: msg.toAddresses,
    ccAddresses: msg.ccAddresses,
    bccAddresses: msg.bccAddresses,
    headers: msg.headers,
    bodyText: msg.bodyText,
    bodyHtml: msg.bodyHtml,
    sizeBytes: msg.sizeBytes,
    receivedAt: msg.receivedAt,
    isRead: msg.isRead,
    isStarred: msg.isStarred,
    isDraft: msg.isDraft,
    isArchived: msg.isArchived ?? false,
    providerLabels: msg.providerLabels,
  };
}

// One sync per account at a time — a UI-triggered sync overlapping a
// worker/IDLE sync would double-process new mail and race the syncToken.
const inFlight = new Map<string, Promise<SyncOutcome>>();

/**
 * Sync a single account: fetch raw messages via the provider strategy,
 * insert new rows, refresh flags on known rows, then advance syncToken.
 */
export async function syncAccount(
  accountId: string,
  db: PrismaClient = prisma,
): Promise<SyncOutcome> {
  const running = inFlight.get(accountId);
  if (running) return running;
  const task = syncAccountInner(accountId, db).finally(() => {
    inFlight.delete(accountId);
  });
  inFlight.set(accountId, task);
  return task;
}

async function syncAccountInner(accountId: string, db: PrismaClient): Promise<SyncOutcome> {
  const account = await db.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
  const provider = providerFor(account);
  const result = await provider.sync({ account, secrets: await secretsFor(account, db) });

  const incoming = result.messages;
  const existing = await db.message.findMany({
    where: {
      emailAccountId: account.id,
      providerMessageId: { in: incoming.map((m) => m.providerMessageId) },
    },
    select: { providerMessageId: true },
  });
  const known = new Set(existing.map((m) => m.providerMessageId));
  const fresh = incoming.filter((m) => !known.has(m.providerMessageId));
  const stale = incoming.filter((m) => known.has(m.providerMessageId));

  // Read receipts are machine mail: flag them read before insert so they
  // don't pollute the unread count, and surface each as a notification.
  try {
    await flagReadReceipts(fresh, db);
  } catch (err) {
    console.error(`[sync] receipt detection failed for ${account.id}:`, err);
  }

  await db.message.createMany({
    data: fresh.map((m) => toCreateInput(account.id, m)),
    skipDuplicates: true,
  });

  // Apply automation rules to the newly inserted batch only.
  if (fresh.length > 0) {
    const inserted = await db.message.findMany({
      where: {
        emailAccountId: account.id,
        providerMessageId: { in: fresh.map((m) => m.providerMessageId) },
      },
      select: { id: true, providerMessageId: true },
    });
    const idByProviderId = new Map(inserted.map((m) => [m.providerMessageId, m.id]));
    try {
      await persistAttachments(fresh, idByProviderId, db);
    } catch (err) {
      console.error(`[sync] attachment persistence failed for ${account.id}:`, err);
    }
    try {
      await ingestCalendarEvents(account.id, fresh, idByProviderId, db);
    } catch (err) {
      console.error(`[sync] calendar ingest failed for ${account.id}:`, err);
    }
    try {
      await applyAutomationRules(account.id, db, {
        messageIds: inserted.map((m) => m.id),
        trigger: "ON_MESSAGE_SYNC",
      });
    } catch (err) {
      console.error(`[sync] rule evaluation failed for ${account.id}:`, err);
    }
  }

  if (stale.length > 0) {
    await db.$transaction(
      stale.map((m) =>
        db.message.update({
          where: {
            emailAccountId_providerMessageId: {
              emailAccountId: account.id,
              providerMessageId: m.providerMessageId,
            },
          },
          data: {
            isRead: m.isRead,
            isStarred: m.isStarred,
            folder: m.folder,
            providerLabels: m.providerLabels,
            // Undefined = the provider doesn't model archive state; leave the
            // local flag untouched.
            ...(m.isArchived !== undefined ? { isArchived: m.isArchived } : {}),
          },
        }),
      ),
    );
  }

  // Mirror provider-side deletions (Gmail history messageDeleted, Graph
  // @removed) so remote trash/permanent deletes stop reappearing locally.
  let deleted = 0;
  if (result.deletedProviderIds && result.deletedProviderIds.length > 0) {
    const removed = await db.message.deleteMany({
      where: {
        emailAccountId: account.id,
        providerMessageId: { in: result.deletedProviderIds },
      },
    });
    deleted = removed.count;
    if (deleted > 0) {
      console.log(`[sync] removed ${deleted} message(s) deleted server-side`);
    }
  }

  await db.emailAccount.update({
    where: { id: account.id },
    data: {
      syncToken: result.nextSyncToken ?? account.syncToken,
      lastSyncedAt: new Date(),
    },
  });

  return {
    accountId: account.id,
    fetched: incoming.length,
    inserted: fresh.length,
    updated: stale.length,
    deleted,
    nextSyncToken: result.nextSyncToken,
  };
}

/** Sync every account that has syncEnabled — sequential to stay gentle on the local DB. */
export async function syncAllAccounts(db: PrismaClient = prisma): Promise<SyncOutcome[]> {
  const accounts = await db.emailAccount.findMany({
    where: { syncEnabled: true, isActive: true },
    select: { id: true },
  });
  const outcomes: SyncOutcome[] = [];
  for (const { id } of accounts) {
    outcomes.push(await syncAccount(id, db));
  }
  return outcomes;
}
