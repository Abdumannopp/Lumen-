import "server-only";

import { getServerEnv } from "@/lib/env";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
] as const;

export function googleConfigured() {
  const env = getServerEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.INTEGRATION_ENCRYPTION_KEY);
}

export function requireGoogleConfig() {
  const env = getServerEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.INTEGRATION_ENCRYPTION_KEY) {
    throw new Error("Google integrations are not configured.");
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    encryptionKey: env.INTEGRATION_ENCRYPTION_KEY,
  };
}
