import { prisma } from "@unwalled/database";
import type { EmailAccount, PrismaClient } from "@unwalled/database";
import { decryptIfPresent } from "./crypto";
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
    default: {
      const exhaustive: never = account.provider;
      throw new Error(`No sync provider for ${String(exhaustive)}`);
    }
  }
}

function secretsFor(account: EmailAccount): AccountSecrets {
  return {
    password: decryptIfPresent(account.passwordEncrypted),
    oauthAccessToken: decryptIfPresent(account.oauthAccessToken),
    oauthRefreshToken: decryptIfPresent(account.oauthRefreshToken),
  };
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
    providerLabels: msg.providerLabels,
  };
}

/**
 * Sync a single account: fetch raw messages via the provider strategy,
 * insert new rows, refresh flags on known rows, then advance syncToken.
 */
export async function syncAccount(
  accountId: string,
  db: PrismaClient = prisma,
): Promise<SyncOutcome> {
  const account = await db.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
  const provider = providerFor(account);
  const result = await provider.sync({ account, secrets: secretsFor(account) });

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
      select: { id: true },
    });
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
          },
        }),
      ),
    );
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
