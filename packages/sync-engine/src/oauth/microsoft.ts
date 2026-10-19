import { postTokenRequest } from "./types";
import type { OAuthClientConfig, OAuthTokens } from "./types";

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";

// Mail.ReadWrite covers Graph sync; the Outlook scopes keep XOAUTH2 IMAP/SMTP viable.
export const MICROSOFT_MAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  "Mail.ReadWrite",
  "Mail.Send",
  "https://outlook.office.com/IMAP.AccessAsUser.All",
  "https://outlook.office.com/SMTP.Send",
] as const;

export function buildMicrosoftAuthorizationUrl(
  config: OAuthClientConfig,
  state: string,
  scopes: readonly string[] = MICROSOFT_MAIL_SCOPES,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    response_mode: "query",
    state,
  });
  return `${AUTHORITY}/authorize?${params.toString()}`;
}

export async function exchangeMicrosoftCode(
  config: OAuthClientConfig & { clientSecret: string },
  code: string,
): Promise<OAuthTokens> {
  return postTokenRequest(`${AUTHORITY}/token`, {
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    scope: MICROSOFT_MAIL_SCOPES.join(" "),
  });
}

export async function refreshMicrosoftAccessToken(
  config: Pick<OAuthClientConfig, "clientId"> & { clientSecret: string },
  refreshToken: string,
): Promise<OAuthTokens> {
  return postTokenRequest(`${AUTHORITY}/token`, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: MICROSOFT_MAIL_SCOPES.join(" "),
  });
}
