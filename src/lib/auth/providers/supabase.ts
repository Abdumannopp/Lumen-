import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { clientEnv, getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  GENERIC_CREDENTIAL_FAILURE,
  type AuthProvider,
  type AuthResult,
  type AuthUser,
  type ConfirmationType,
} from "@/lib/auth/types";

/**
 * Supabase Auth, over its SSR cookie flow.
 *
 * Two rules govern this file.
 *
 * **The session is verified, never decoded.** Identity comes from
 * `getUser()`, which asks Supabase to validate the token. `getSession()` would
 * be faster and would return whatever the browser sent — a claim, not a fact.
 * Anything that decides access must not be built on a claim.
 *
 * **Provider messages do not reach the person.** Supabase distinguishes "no
 * such user" from "wrong password"; passing that through would turn the login
 * form into a way of testing which addresses are registered. Failures are
 * logged with their real cause and returned as one message.
 */

/**
 * A client bound to this request's cookies.
 *
 * Built per request, never shared: a client carries a session, and a shared one
 * would carry it between people. `setAll` is wrapped because Next.js forbids
 * writing cookies during a render — a refresh that happens while a page renders
 * is dropped rather than thrown, and the next Server Action writes it instead.
 */
async function client() {
  const env = getServerEnv();
  const jar = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL as string,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              jar.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render. Expected; the session is
            // refreshed on the next action or route handler instead.
          }
        },
      },
    },
  );
}

function toAuthUser(user: { id: string; email?: string | null; email_confirmed_at?: string | null }): AuthUser {
  return {
    id: user.id,
    email: user.email ?? "",
    emailVerified: Boolean(user.email_confirmed_at),
  };
}

/** Log the real reason, return one that gives nothing away. */
function opaque(context: string, error: { message: string; status?: number } | null): AuthResult {
  logger.warn("Supabase auth rejected a request", {
    context,
    status: error?.status,
    message: error?.message,
  });

  return { ok: false, message: GENERIC_CREDENTIAL_FAILURE };
}

export class SupabaseAuthProvider implements AuthProvider {
  readonly id = "supabase";

  async currentUser(): Promise<AuthUser | null> {
    const supabase = await client();

    // getUser, not getSession: this answer decides what data is reachable.
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) return null;

    return toAuthUser(data.user);
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    const supabase = await client();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      // Must be on the allowlist in the Supabase dashboard, or the link in the
      // email silently falls back to the project's site URL.
      options: { emailRedirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/auth/confirm` },
    });

    if (error) {
      logger.warn("Signup rejected", { status: error.status, message: error.message });

      // A rate limit is worth saying plainly — the person can act on it. Every
      // other failure, including "already registered", reads the same as
      // success so the form cannot enumerate accounts.
      if (error.status === 429) {
        return { ok: false, message: "Too many attempts. Wait a minute and try again." };
      }
    }

    return { ok: true, needsConfirmation: true };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const supabase = await client();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) return opaque("signIn", error);

    if (!data.user.email_confirmed_at) {
      return {
        ok: false,
        needsConfirmation: true,
        message: "Confirm your email address before signing in.",
      };
    }

    return { ok: true, user: toAuthUser(data.user) };
  }

  async signOut(): Promise<void> {
    const supabase = await client();
    await supabase.auth.signOut();
  }

  async signOutOtherSessions(): Promise<void> {
    const supabase = await client();

    // Supabase's "others" scope revokes every refresh token but this one, which
    // is exactly the semantics we want. A failure is logged rather than thrown:
    // the password has already been changed, and reporting the change as failed
    // would send the person to try again on an account whose password is now
    // the new one.
    const { error } = await supabase.auth.signOut({ scope: "others" });

    if (error) {
      logger.warn("Could not revoke other sessions", { message: error.message });
    }
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<AuthResult> {
    const supabase = await client();

    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
      logger.warn("Password reset rejected", { status: error.status, message: error.message });
    }

    // Always reported as sent. Whether the address is registered is not
    // something this form gets to reveal.
    return { ok: true };
  }

  async updatePassword(password: string): Promise<AuthResult> {
    const supabase = await client();

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      logger.warn("Password update rejected", { status: error.status, message: error.message });
      return { ok: false, message: "That link has expired. Ask for a new one." };
    }

    return { ok: true };
  }

  async confirm(tokenHash: string, type: ConfirmationType): Promise<AuthResult> {
    const supabase = await client();

    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

    if (error || !data.user) {
      logger.warn("Confirmation link rejected", { type, message: error?.message });
      return { ok: false, message: "That link has expired or has already been used." };
    }

    return { ok: true, user: toAuthUser(data.user) };
  }
}
