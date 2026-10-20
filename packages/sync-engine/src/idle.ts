import { ImapFlow } from "imapflow";
import { prisma } from "@dzong/database";
import type { EmailAccount } from "@dzong/database";
import { decryptIfPresent } from "./crypto";
import { syncAccount } from "./engine";
import { imapClientOptions } from "./providers/imap";
import { runPostSync } from "./post-sync";

const RECONNECT_MS = 30_000; // backoff after a dropped connection
const DEBOUNCE_MS = 2_000; // batch bursts of server notifications into one sync
const ACCOUNT_REFRESH_MS = 10 * 60_000; // pick up newly added IMAP accounts

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Near-instant mail: hold a persistent IMAP connection per account in IDLE.
 * ImapFlow emits `exists` while IDLE stays active — the await on client.idle()
 * only returns when the IDLE session itself ends — so new-mail events drive
 * incremental sync + post-processing. A dropped connection just reconnects;
 * the periodic worker sync remains the fallback while a watcher is down.
 */
async function idleLoop(accountId: string): Promise<void> {
  while (true) {
    let client: ImapFlow | undefined;
    try {
      const account: EmailAccount | null = await prisma.emailAccount.findUnique({
        where: { id: accountId },
      });
      if (!account || !account.syncEnabled || account.provider !== "IMAP_SMTP") return;
      if (!account.imapHost || !account.username) return;
      const password = decryptIfPresent(account.passwordEncrypted);
      if (!password) return;

      client = new ImapFlow(imapClientOptions(account, password));
      client.on("error", () => {
        /* handled by the idle await rejecting / close below */
      });
      await client.connect();
      await client.mailboxOpen("INBOX");
      console.log(`[idle] watching ${account.emailAddress} for new mail`);

      let syncing = false;
      let again = false;
      const sync = async () => {
        if (syncing) {
          again = true;
          return;
        }
        syncing = true;
        do {
          again = false;
          try {
            const outcome = await syncAccount(accountId);
            if (outcome.inserted > 0) {
              console.log(`[idle] ${account.emailAddress}: ${outcome.inserted} new message(s)`);
              await runPostSync(accountId, outcome.insertedIds);
            }
          } catch (err) {
            console.error(`[idle] sync failed for ${account.emailAddress}:`, err);
          }
        } while (again);
        syncing = false;
      };

      let debounce: NodeJS.Timeout | undefined;
      client.on("exists", () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => void sync(), DEBOUNCE_MS);
      });

      await sync(); // catch up on anything received while the watcher was down

      while (client.usable) {
        // Stays in IDLE until the server or maxIdleTime ends the session;
        // `exists` events fire and trigger sync while this awaits.
        await client.idle();
        const current = await prisma.emailAccount.findUnique({
          where: { id: accountId },
          select: { syncEnabled: true },
        });
        if (!current?.syncEnabled) return;
      }
    } catch (err) {
      console.error(`[idle] watcher for account ${accountId} dropped:`, err);
    } finally {
      try {
        await client?.logout();
      } catch {
        /* already gone */
      }
    }
    await sleep(RECONNECT_MS);
  }
}

/** Start one IDLE watcher per connected IMAP account, and re-scan for new
 *  accounts periodically. Fire-and-forget — watchers run for the life of
 *  the process. */
export async function startIdleWatchers(): Promise<void> {
  const watching = new Set<string>();
  const scan = async () => {
    const accounts = await prisma.emailAccount.findMany({
      where: { provider: "IMAP_SMTP", syncEnabled: true },
      select: { id: true },
    });
    for (const { id } of accounts) {
      if (watching.has(id)) continue;
      watching.add(id);
      void idleLoop(id);
    }
  };
  await scan();
  setInterval(() => void scan().catch(() => {}), ACCOUNT_REFRESH_MS).unref();
}
