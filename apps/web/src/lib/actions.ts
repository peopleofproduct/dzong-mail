"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  buildGoogleAuthorizationUrl,
  buildMicrosoftAuthorizationUrl,
  encryptSecret,
  syncAccount,
} from "@unwalled/sync-engine";

const DEMO_USER_EMAIL = "me@unwalled.local";

async function getOrCreateLocalUser() {
  return prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: { email: DEMO_USER_EMAIL, name: "Local User" },
  });
}

async function redirectUriFor(provider: "google" | "microsoft"): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}/api/oauth/${provider}/callback`;
}

export async function connectMockAccount() {
  const user = await getOrCreateLocalUser();
  const account = await prisma.emailAccount.upsert({
    where: {
      userId_emailAddress: { userId: user.id, emailAddress: "demo@unwalled.local" },
    },
    update: {},
    create: {
      userId: user.id,
      provider: "MOCK",
      emailAddress: "demo@unwalled.local",
      displayName: "Demo Inbox",
    },
  });
  try {
    await syncAccount(account.id);
  } catch (err) {
    redirect(`/?error=${encodeURIComponent(String(err))}`);
  }
  revalidatePath("/");
}

export async function connectImapAccount(formData: FormData) {
  const user = await getOrCreateLocalUser();
  const get = (key: string) => String(formData.get(key) ?? "").trim();
  const imapPort = Number.parseInt(get("imapPort"), 10);
  const smtpPort = Number.parseInt(get("smtpPort"), 10);
  const password = get("password");

  await prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider: "IMAP_SMTP",
      emailAddress: get("emailAddress"),
      displayName: get("displayName") || null,
      imapHost: get("imapHost") || null,
      imapPort: Number.isFinite(imapPort) ? imapPort : 993,
      imapSecurity: (get("imapSecurity") || "SSL_TLS") as "SSL_TLS" | "STARTTLS" | "NONE",
      smtpHost: get("smtpHost") || null,
      smtpPort: Number.isFinite(smtpPort) ? smtpPort : null,
      username: get("username") || null,
      passwordEncrypted: password ? encryptSecret(password) : null,
    },
  });
  revalidatePath("/");
}

export async function connectOAuthAccount(formData: FormData) {
  const user = await getOrCreateLocalUser();
  const provider = String(formData.get("provider"));
  if (provider !== "GOOGLE" && provider !== "MICROSOFT") {
    redirect(`/?error=${encodeURIComponent("Unknown OAuth provider")}`);
  }
  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();
  if (!clientId || !clientSecret) {
    redirect(`/?error=${encodeURIComponent("Client ID and secret are required")}`);
  }

  const account = await prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider,
      emailAddress: `${provider.toLowerCase()}-${Date.now()}@pending.local`,
      oauthClientId: clientId,
      oauthClientSecret: encryptSecret(clientSecret),
    },
  });

  const config = {
    clientId,
    redirectUri: await redirectUriFor(provider.toLowerCase() as "google" | "microsoft"),
  };
  const url =
    provider === "GOOGLE"
      ? buildGoogleAuthorizationUrl(config, account.id)
      : buildMicrosoftAuthorizationUrl(config, account.id);
  redirect(url);
}

export async function syncAccountNow(accountId: string) {
  try {
    await syncAccount(accountId);
  } catch (err) {
    redirect(`/?error=${encodeURIComponent(String(err))}`);
  }
  revalidatePath("/");
}

export async function removeAccount(accountId: string) {
  await prisma.emailAccount.delete({ where: { id: accountId } });
  revalidatePath("/");
}

export async function toggleMessageFlag(messageId: string, flag: "isRead" | "isStarred") {
  const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  await prisma.message.update({
    where: { id: messageId },
    data: { [flag]: !message[flag] },
  });
  revalidatePath("/");
}
