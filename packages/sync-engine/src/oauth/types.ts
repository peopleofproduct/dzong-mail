export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  tokenType?: string;
  idToken?: string;
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

interface RawTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export async function postTokenRequest(
  url: string,
  params: Record<string, string>,
): Promise<OAuthTokens> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAuth token request failed (${res.status}): ${body}`);
  }
  const raw = (await res.json()) as RawTokenResponse;
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000) : undefined,
    scope: raw.scope,
    tokenType: raw.token_type,
    idToken: raw.id_token,
  };
}
