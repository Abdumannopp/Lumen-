/**
 * Authentication contract.
 *
 * Identity is behind an interface for the same reason the AI provider is: the
 * application should not know or care which vendor issues a session, and the
 * test suites need to drive real sign-ins without a network call or an account.
 *
 * What lives behind this interface is narrow on purpose. Passwords, tokens and
 * session refresh are the provider's problem. Everything Lumen actually cares
 * about — who is this, may they see this workspace — is decided in
 * `src/lib/auth/dal.ts`, against our own tables, from an identity the provider
 * has already verified.
 */

/** A person the provider has authenticated. Never carries a credential. */
export interface AuthUser {
  /** The provider's user id. Also the primary key of our `users` row. */
  id: string;
  email: string;
  /** False until the confirmation link has been followed. */
  emailVerified: boolean;
}

export interface AuthResult {
  ok: boolean;
  /**
   * Safe to show the person. Deliberately vague about whether an account
   * exists — see `GENERIC_CREDENTIAL_FAILURE`.
   */
  message?: string;
  user?: AuthUser;
  /** The account was created but the email has not been confirmed yet. */
  needsConfirmation?: boolean;
}

/**
 * The one message a failed sign-in or password reset may return.
 *
 * Saying "no such account" tells a stranger which addresses are registered,
 * which is how account lists get harvested. Saying "wrong password" tells them
 * the same thing. One message for both, always.
 */
export const GENERIC_CREDENTIAL_FAILURE =
  "That email and password do not match an account.";

/** What a confirmation link is for. */
export type ConfirmationType = "signup" | "recovery" | "email_change";

export interface AuthProvider {
  readonly id: string;

  /**
   * The signed-in user for this request, or null.
   *
   * Must verify the session with the provider rather than trusting whatever the
   * browser sent. A decoded cookie is a claim; a verified session is a fact.
   */
  currentUser(): Promise<AuthUser | null>;

  signUp(email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;

  /** Always reports success, whether or not the address is registered. */
  requestPasswordReset(email: string, redirectTo: string): Promise<AuthResult>;

  /** Sets a new password for the session established by a recovery link. */
  updatePassword(password: string): Promise<AuthResult>;

  /**
   * End every session except this one.
   *
   * Called after a password change. A password change is what someone does
   * when they think an intruder is in their account, and it means nothing if
   * the intruder's session survives it — so this is part of the contract
   * rather than an optimisation a provider may skip.
   *
   * This session is deliberately kept: ending it would sign the person out of
   * the page where they just fixed the problem.
   */
  signOutOtherSessions(): Promise<void>;

  /** Exchange the token from an emailed link for a session. */
  confirm(tokenHash: string, type: ConfirmationType): Promise<AuthResult>;
}
