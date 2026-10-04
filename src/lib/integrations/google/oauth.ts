import "server-only";

import { encryptSecret, decryptSecret } from "@/lib/integrations/google/crypto";
import { GOOGLE_SCOPES, requireGoogleConfig } from "@/lib/integrations/google/config";

export interface GoogleOAuthState {
  projectId: string;
  issuedAt: number;
  nonce: string;
}

export function createGoogleState(input: Omit<GoogleOAuthState, "issuedAt">) {
  return encryptSecret(JSON.stringify({ ...input, issuedAt: Date.now() } satisfies GoogleOAuthState));
}

export function readGoogleState(value: string): GoogleOAuthState {
  const parsed = JSON.parse(decryptSecret(value)) as Partial<GoogleOAuthState>;
  if (
    typeof parsed.projectId !== "string" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.issuedAt !== "number" ||
    Date.now() - parsed.issuedAt > 10 * 60 * 1000
  ) {
    throw new Error("Google authorization has expired. Please try again.");
  }
  return parsed as GoogleOAuthState;
}

export function googleRedirectUri() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl.replace(/\/$/, "")}/api/integrations/google/callback`;
}

export function buildGoogleAuthorizationUrl(state: string) {
  const { clientId } = requireGoogleConfig();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeGoogleCode(code: string) {
  const { clientId, clientSecret } = requireGoogleConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const payload = (await response.json()) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "Google authorization failed.");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresIn: payload.expires_in ?? 3600,
    scope: payload.scope?.split(" ").filter(Boolean) ?? [...GOOGLE_SCOPES],
  };
}

export async function refreshGoogleAccessToken(refreshTokenEncrypted: string) {
  const { clientId, clientSecret } = requireGoogleConfig();
  const refreshToken = decryptSecret(refreshTokenEncrypted);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const payload = (await response.json()) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "Google token refresh failed.");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ? encryptSecret(payload.refresh_token) : null,
    scope: payload.scope?.split(" ").filter(Boolean) ?? [],
  };
}
