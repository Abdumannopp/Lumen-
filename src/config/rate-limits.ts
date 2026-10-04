/**
 * How fast a stranger may knock on a door that has no session yet.
 *
 * Sign in, sign up and password reset are the three endpoints an attacker can
 * hit with nothing but a browser — no account, no cookie, nothing to meter
 * against the way `src/lib/usage/quota.ts` meters an AI call. Numbers here are
 * a business decision about how much friction a real person retrying a typo
 * should feel, traded off against how long a script gets to guess passwords or
 * bomb an inbox, and belong in configuration for the same reason the AI
 * allowance does: changing them should not require reading the function that
 * enforces them.
 *
 * Proven necessary, not precautionary: 200 wrong-password sign-in attempts in
 * about six seconds were refused by nothing before this file existed.
 */

export interface RateLimitConfig {
  /** The fixed window's length. */
  windowMs: number;
  /** Attempts allowed inside one window before the next one is refused. */
  limit: number;
}

const MINUTES = 60_000;

export const RATE_LIMITS = {
  /**
   * Ten attempts per five minutes per address. Loose enough that someone who
   * mistypes a password a few times in a row never notices this exists;
   * tight enough that guessing a password by trying common ones takes days
   * rather than seconds.
   */
  signIn: { windowMs: 5 * MINUTES, limit: 10 } satisfies RateLimitConfig,
  /**
   * Five per fifteen minutes. Sign-up is also the invite gate and the address
   * a confirmation email goes to — the thing worth slowing down here is
   * spamming one inbox with confirmation mail, or grinding through guessed
   * invite tokens, not any one legitimate person signing up more than once.
   */
  signUp: { windowMs: 15 * MINUTES, limit: 5 } satisfies RateLimitConfig,
  /**
   * Five per fifteen minutes, same reasoning as sign-up: the address is sent
   * mail regardless of whether it has an account, and that mail is the thing
   * being rate-limited, not "wrong attempts" — there is no such thing here.
   */
  passwordReset: { windowMs: 15 * MINUTES, limit: 5 } satisfies RateLimitConfig,
} as const;
