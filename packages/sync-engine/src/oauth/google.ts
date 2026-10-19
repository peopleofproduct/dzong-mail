import { postTokenRequest } from "./types";
import type { OAuthClientConfig, OAuthTokens } from "./types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Full-mail scope keeps IMAP-style operations (labels, archive, send) possible.
export const GOOGLE_MAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://mail.google.com/",
] as const;

export function buildGoogleAuthorizationUrl(
  config: OAuthClientConfig,
  state: string,
  scopes: readonly string[] = GOOGLE_MAIL_SCOPES,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(
  config: OAuthClientConfig & { clientSecret: string },
  code: string,
): Promise<OAuthTokens> {
  return postTokenRequest(TOKEN_URL, {
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });
}

export async function refreshGoogleAccessToken(
  config: Pick<OAuthClientConfig, "clientId"> & { clientSecret: string },
  refreshToken: string,
): Promise<OAuthTokens> {
  return postTokenRequest(TOKEN_URL, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}
