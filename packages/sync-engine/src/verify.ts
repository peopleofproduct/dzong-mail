import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { prisma } from "@dzong/database";
import type { EmailAccount, PrismaClient } from "@dzong/database";
import { decryptIfPresent, decryptSecret } from "./crypto";
import { refreshGoogleAccessToken } from "./oauth/google";
import { refreshMicrosoftAccessToken } from "./oauth/microsoft";
import { imapClientOptions } from "./providers/imap";

/**
 * Live provider verification — exercises each account's real connectivity
 * path (IMAP login, SMTP verify, Gmail profile, Graph /me) without touching
 * mail data. Powers `npm run verify:providers` and the settings page badge.
 */

export interface VerifyOutcome {
  accountId: string;
  provider: string;
  emailAddress: string;
  ok: boolean;
  detail: string;
}

async function accessTokenFor(account: EmailAccount): Promise<string | null> {
  let token = decryptIfPresent(account.oauthAccessToken);
  const expiring =
    account.oauthTokenExpiresAt !== null &&
    account.oauthTokenExpiresAt.getTime() < Date.now() + 60_000;
  if (!token || expiring) {
    const refreshToken = decryptIfPresent(account.oauthRefreshToken);
    if (!refreshToken || !account.oauthClientId || !account.oauthClientSecret) {
      return token ?? null;
    }
    const refresh =
      account.provider === "GOOGLE" ? refreshGoogleAccessToken : refreshMicrosoftAccessToken;
    const tokens = await refresh(
      {
        clientId: account.oauthClientId,
        clientSecret: decryptSecret(account.oauthClientSecret),
      },
      refreshToken,
    );
    token = tokens.accessToken;
  }
  return token;
}

async function verifyImap(account: EmailAccount): Promise<string> {
  if (!account.imapHost || !account.username) {
    return "missing IMAP host or username";
  }
  const password = decryptIfPresent(account.passwordEncrypted);
  if (!password) return "missing password";
  const client = new ImapFlow(imapClientOptions(account, password));
  client.on("error", () => {});
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
    return "IMAP login + INBOX ok";
  } finally {
    await client.logout().catch(() => {});
  }
}

async function verifySmtp(account: EmailAccount): Promise<string> {
  if (!account.smtpHost || !account.username) return "no SMTP configured";
  const password = decryptIfPresent(account.passwordEncrypted);
  const security = account.smtpSecurity ?? "SSL_TLS";
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort ?? (security === "SSL_TLS" ? 465 : 587),
    secure: security === "SSL_TLS",
    requireTLS: security === "STARTTLS",
    ignoreTLS: security === "NONE",
    tls: { rejectUnauthorized: !account.allowSelfSignedCerts },
    auth: { user: account.username, pass: password ?? "" },
    connectionTimeout: 10_000,
  });
  await transporter.verify();
  return "SMTP verify ok";
}

export async function verifyAccount(
  accountId: string,
  db: PrismaClient = prisma,
): Promise<VerifyOutcome> {
  const account = await db.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
  const base = {
    accountId: account.id,
    provider: account.provider,
    emailAddress: account.emailAddress,
  };
  try {
    switch (account.provider) {
      case "IMAP_SMTP": {
        const imap = await verifyImap(account);
        const smtp = await verifySmtp(account).catch((e) => `SMTP: ${String(e)}`);
        return { ...base, ok: true, detail: `${imap}; ${smtp}` };
      }
      case "GOOGLE": {
        const token = await accessTokenFor(account);
        if (!token) return { ...base, ok: false, detail: "no usable OAuth token" };
        const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { ...base, ok: false, detail: `Gmail profile ${res.status}` };
        const profile = (await res.json()) as { emailAddress?: string; messagesTotal?: number };
        return {
          ...base,
          ok: true,
          detail: `Gmail API ok - ${profile.emailAddress ?? "?"} (${profile.messagesTotal ?? "?"} msgs)`,
        };
      }
      case "MICROSOFT": {
        const token = await accessTokenFor(account);
        if (!token) return { ...base, ok: false, detail: "no usable OAuth token" };
        const res = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { ...base, ok: false, detail: `Graph /me ${res.status}` };
        const me = (await res.json()) as { mail?: string; userPrincipalName?: string };
        return {
          ...base,
          ok: true,
          detail: `Graph ok - ${me.mail ?? me.userPrincipalName ?? "?"}`,
        };
      }
      case "MOCK":
        return { ...base, ok: true, detail: "demo provider - always available" };
      case "IMPORTED":
        return { ...base, ok: true, detail: "import-only account - nothing to verify" };
      default:
        return { ...base, ok: false, detail: `unknown provider ${String(account.provider)}` };
    }
  } catch (err) {
    return { ...base, ok: false, detail: String(err instanceof Error ? err.message : err) };
  }
}

export async function verifyAllAccounts(db: PrismaClient = prisma): Promise<VerifyOutcome[]> {
  const accounts = await db.emailAccount.findMany({ select: { id: true } });
  const out: VerifyOutcome[] = [];
  for (const { id } of accounts) {
    out.push(await verifyAccount(id, db));
  }
  return out;
}
