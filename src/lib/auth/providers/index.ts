import "server-only";

import { getServerEnv } from "@/lib/env";
import type { AuthProvider } from "@/lib/auth/types";
import { LocalAuthProvider } from "@/lib/auth/providers/local";
import { SupabaseAuthProvider } from "@/lib/auth/providers/supabase";

/**
 * Identity provider resolution.
 *
 * Deliberately not cached, unlike `getProvider()` for AI.
 *
 * An AI provider is a stateless client built from process-wide configuration,
 * so one instance serves every request. An auth provider reads and writes *this
 * request's* cookies. Holding one across requests is how one person's session
 * ends up answering for another, and the cost of constructing one is nothing.
 */
export function getAuthProvider(): AuthProvider {
  const env = getServerEnv();

  return env.AUTH_PROVIDER === "supabase"
    ? new SupabaseAuthProvider()
    : new LocalAuthProvider();
}
