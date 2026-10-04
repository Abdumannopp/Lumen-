import "server-only";

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { getServerEnv } from "@/lib/env";
import {
  GENERIC_CREDENTIAL_FAILURE,
  type AuthProvider,
  type AuthResult,
  type AuthUser,
  type ConfirmationType,
} from "@/lib/auth/types";

/**
 * A local identity provider, for development and the test suites.
 *
 * **It is a test double, not an authentication system**, and `src/lib/env.ts`
 * refuses to start with it when `APP_ENV` is `production`. Its
 * purpose is to let the suites drive real signup, login and logout — and so
 * exercise the authorisation layer that actually protects tenant data — without
 * a network call, an account, or an email inbox.
 *
 * What it does do properly, because the tests depend on it being honest:
 *
 * - passwords are hashed with scrypt and compared in constant time, so "wrong
 *   password is rejected" is a real assertion rather than a staged one
 * - sessions are HMAC-signed, so a forged cookie is rejected rather than
 *   trusted
 * - a failed sign-in returns the same message whether the account exists or the
 *   password was wrong
 *
 * What it deliberately does not do: survive a restart. Credentials and
 * confirmation tokens live in this process's memory, so they are gone when it
 * stops. That is correct for a double — persisting credentials would mean a
 * credential store in the schema, and the schema says, truthfully, that no
 * credential is stored in this database.
 */

interface Account {
  id: string;
  email: string;
  passwordHash: Buffer;
  salt: Buffer;
  emailVerified: boolean;
  /**
   * Bumped to invalidate every session issued before now.
   *
   * The session cookie carries the epoch it was signed with, so raising this
   * makes every older cookie fail verification at once — which is how "end
   * every other session" is implemented without a session table.
   */
  sessionEpoch: number;
  /** Token from the most recent confirmation or recovery link. */
  pendingToken?: { value: string; type: ConfirmationType };
}

/**
 * Per-process, and cached on globalThis so Next's dev server does not lose
 * every account each time it re-evaluates a module.
 */
const store = ((globalThis as unknown as { lumenLocalAuth?: Map<string, Account> })
  .lumenLocalAuth ??= new Map<string, Account>());

const SESSION_COOKIE = "lumen.local_session";

/**
 * The signing key.
 *
 * Derived from DATABASE_URL rather than being its own setting: this provider
 * cannot run in production, so the key only has to be unguessable by something
 * outside the process and stable across a dev-server restart. Adding another
 * required secret to configure a development-only double would be noise.
 */
function signingKey(): string {
  return `lumen-local-auth:${getServerEnv().DATABASE_URL}`;
}

function sign(userId: string, epoch: number): string {
  const payload = `${userId}.${epoch}`;
  const mac = createHmac("sha256", signingKey()).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

function verify(cookieValue: string): { userId: string; epoch: number } | null {
  const separator = cookieValue.lastIndexOf(".");
  if (separator <= 0) return null;

  const payload = cookieValue.slice(0, separator);
  const presented = cookieValue.slice(separator + 1);
  const expected = createHmac("sha256", signingKey()).update(payload).digest("hex");

  // Same-length hex strings, so a constant-time comparison is meaningful.
  if (presented.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(presented, "hex"), Buffer.from(expected, "hex"))) {
    return null;
  }

  const dot = payload.lastIndexOf(".");
  if (dot <= 0) return null;

  return { userId: payload.slice(0, dot), epoch: Number(payload.slice(dot + 1)) };
}

const hash = (password: string, salt: Buffer) => scryptSync(password, salt, 64);

/**
 * A user id derived from the address rather than drawn at random.
 *
 * Credentials live in this process's memory and die with it, but the `users`
 * and `workspaces` rows they created live in PostgreSQL and do not. A random id
 * would mean every dev-server restart minted a second account for the same
 * person and stranded the first one's workspace — the test suites would then be
 * asserting against whichever of the two the query happened to return.
 *
 * Deriving it makes a restart continuous instead: same address, same id, same
 * workspace waiting. It reveals nothing, because the address is not a secret
 * and this provider never runs anywhere the ids are worth guessing.
 */
const idFor = (email: string) =>
  `local-${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;

const find = (email: string) => store.get(email.trim().toLowerCase());

export class LocalAuthProvider implements AuthProvider {
  readonly id = "local";

  async currentUser(): Promise<AuthUser | null> {
    const jar = await cookies();
    const raw = jar.get(SESSION_COOKIE)?.value;
    if (!raw) return null;

    const session = verify(raw);
    if (!session) return null;

    for (const account of store.values()) {
      if (account.id !== session.userId) continue;

      // Signed correctly, but issued before the account's sessions were
      // revoked — which is what a password change does.
      if (session.epoch < account.sessionEpoch) return null;

      return { id: account.id, email: account.email, emailVerified: account.emailVerified };
    }

    // Signed correctly but the account is gone — the process restarted, or it
    // was removed. Either way there is no user here.
    return null;
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    const key = email.trim().toLowerCase();

    if (find(key)) {
      // Same shape as a successful signup: whether an address is already
      // registered is not something a stranger gets to learn from this form.
      return { ok: true, needsConfirmation: true };
    }

    const salt = randomBytes(16);
    const account: Account = {
      id: idFor(key),
      email: key,
      passwordHash: hash(password, salt),
      salt,
      emailVerified: false,
      sessionEpoch: 1,
      pendingToken: { value: randomBytes(16).toString("hex"), type: "signup" },
    };

    store.set(key, account);

    return { ok: true, needsConfirmation: true };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const account = find(email);

    if (!account) return { ok: false, message: GENERIC_CREDENTIAL_FAILURE };

    const presented = hash(password, account.salt);
    if (!timingSafeEqual(presented, account.passwordHash)) {
      return { ok: false, message: GENERIC_CREDENTIAL_FAILURE };
    }

    if (!account.emailVerified) {
      return {
        ok: false,
        needsConfirmation: true,
        message: "Confirm your email address before signing in.",
      };
    }

    await this.#openSession(account.id);

    return {
      ok: true,
      user: { id: account.id, email: account.email, emailVerified: true },
    };
  }

  async signOut(): Promise<void> {
    const jar = await cookies();
    jar.delete(SESSION_COOKIE);
  }

  async requestPasswordReset(email: string): Promise<AuthResult> {
    const account = find(email);

    if (account) {
      account.pendingToken = { value: randomBytes(16).toString("hex"), type: "recovery" };
    }

    // Reported the same way either way, so the response cannot be used to test
    // whether an address is registered.
    return { ok: true };
  }

  async updatePassword(password: string): Promise<AuthResult> {
    const user = await this.currentUser();
    if (!user) return { ok: false, message: "That link is no longer valid." };

    const account = find(user.email);
    if (!account) return { ok: false, message: "That link is no longer valid." };

    account.salt = randomBytes(16);
    account.passwordHash = hash(password, account.salt);

    return { ok: true };
  }

  /**
   * End every session but this one, by raising the account's epoch and
   * re-issuing this request's cookie at the new value.
   *
   * Every cookie signed at the old epoch now fails verification. No session
   * table, and no way for one to fall out of step with the accounts it
   * describes.
   */
  async signOutOtherSessions(): Promise<void> {
    const user = await this.currentUser();
    if (!user) return;

    const account = find(user.email);
    if (!account) return;

    account.sessionEpoch += 1;

    await this.#openSession(account.id);
  }

  async confirm(tokenHash: string, type: ConfirmationType): Promise<AuthResult> {
    for (const account of store.values()) {
      if (account.pendingToken?.value !== tokenHash) continue;
      if (account.pendingToken.type !== type) continue;

      // One use only: a link that works twice is a link that works for whoever
      // finds it in a forwarded email.
      account.pendingToken = undefined;
      account.emailVerified = true;

      await this.#openSession(account.id);

      return {
        ok: true,
        user: { id: account.id, email: account.email, emailVerified: true },
      };
    }

    return { ok: false, message: "That link has expired or has already been used." };
  }

  async #openSession(userId: string): Promise<void> {
    const jar = await cookies();
    let epoch = 1;

    for (const account of store.values()) {
      if (account.id === userId) epoch = account.sessionEpoch;
    }

    jar.set(SESSION_COOKIE, sign(userId, epoch), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      // Never `secure` — this provider cannot run in production, and requiring
      // HTTPS would stop it working on http://localhost.
      secure: false,
    });
  }

  /** Used by the test suites to read the link the provider would have emailed. */
  static pendingTokenFor(email: string): string | undefined {
    return find(email)?.pendingToken?.value;
  }
}
