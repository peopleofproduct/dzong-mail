import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret, exchangeGoogleCode } from "@unwalled/sync-engine";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const accountId = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || !accountId) {
    return NextResponse.redirect(
      new URL(
        `/?error=${encodeURIComponent(error ?? "OAuth callback missing parameters")}`,
        url.origin,
      ),
    );
  }

  const account = await prisma.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (!account.oauthClientId || !account.oauthClientSecret) {
    return NextResponse.redirect(new URL("/?error=Missing%20OAuth%20client%20keys", url.origin));
  }

  const tokens = await exchangeGoogleCode(
    {
      clientId: account.oauthClientId,
      clientSecret: decryptSecret(account.oauthClientSecret),
      redirectUri: `${url.origin}/api/oauth/google/callback`,
    },
    code,
  );

  // Resolve the real mailbox address now that we hold a token.
  let emailAddress = account.emailAddress;
  try {
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (res.ok) {
      const profile = (await res.json()) as { email?: string };
      if (profile.email) emailAddress = profile.email;
    }
  } catch {
    // Keep the placeholder address — the account can be renamed later.
  }

  const tokenData = {
    oauthAccessToken: encryptSecret(tokens.accessToken),
    oauthRefreshToken: tokens.refreshToken
      ? encryptSecret(tokens.refreshToken)
      : account.oauthRefreshToken,
    oauthTokenExpiresAt: tokens.expiresAt,
    oauthScopes: tokens.scope?.split(" ") ?? [],
  };

  // If this address is already connected, refresh that account's tokens and
  // drop the pending row instead of colliding on the unique key.
  const existing = await prisma.emailAccount.findUnique({
    where: { userId_emailAddress: { userId: account.userId, emailAddress } },
  });
  if (existing && existing.id !== accountId) {
    await prisma.emailAccount.update({ where: { id: existing.id }, data: tokenData });
    await prisma.emailAccount.delete({ where: { id: accountId } });
    return NextResponse.redirect(
      new URL(
        "/?notice=" +
          encodeURIComponent(`${emailAddress} is already connected — credentials refreshed`),
        url.origin,
      ),
    );
  }

  await prisma.emailAccount.update({
    where: { id: accountId },
    data: { emailAddress, ...tokenData },
  });

  return NextResponse.redirect(new URL("/?notice=Google%20account%20connected", url.origin));
}
