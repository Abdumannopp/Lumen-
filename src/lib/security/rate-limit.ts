import "server-only";

import { headers } from "next/headers";
import { createHash } from "node:crypto";

import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import type { RateLimitConfig } from "@/config/rate-limits";

/**
 * Basic abuse protection for the endpoints a stranger can reach with no
 * session: sign in, sign up, password reset. See `src/config/rate-limits.ts`
 * for what "basic" means in numbers and why.
 *
 * This is a fixed-window counter, not a sliding one, and it is claimed with a
 * plain upsert rather than the conditional `updateMany` `src/lib/usage/quota.ts`
 * uses to make the AI allowance exact under concurrency. Both simplifications
 * are deliberate: a burst of requests landing right at a window boundary can
 * let a few more attempts through than the limit states, and that is an
 * acceptable imprecision for a defense-in-depth guard against automated
 * abuse — it would not be acceptable for something a customer is billed
 * against.
 */

/**
 * The caller's IP, as best this deployment can tell.
 *
 * Forwarding headers are only trusted when the deployment explicitly opts in
 * with `TRUST_PROXY_HEADERS=true`. That is intentionally a boot-time contract
 * outside local development: the reverse proxy must strip any client-supplied
 * forwarding headers and write the real address itself. Without that boundary,
 * an attacker can rotate a forged `X-Forwarded-For` value and bypass an IP
 * limit. Stable identity limits are applied alongside the IP limit for auth
 * actions so changing networks is not enough to brute-force one account.
 */
async function clientIp(): Promise<string> {
  const env = getServerEnv();
  const list = await headers();

  if (!env.TRUST_PROXY_HEADERS) return "local";

  const realIp = list.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = list.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;

  return "unknown";
}

function bucketKey(action: string, value: string): string {
  return createHash("sha256").update(`${action}:${value}`).digest("hex");
}

export interface RateLimitResult {
  limited: boolean;
  /** How long until the caller may try again, rounded up. */
  retryAfterSeconds: number;
}

/** A window's own start, so concurrent callers in the same window agree on it. */
function windowStart(config: RateLimitConfig): Date {
  return new Date(Math.floor(Date.now() / config.windowMs) * config.windowMs);
}

/**
 * Claim one attempt for `key` in the current window.
 *
 * `local` is exempt. It is a test double `src/lib/env.ts` refuses to run
 * outside local development (see the note there on `APP_ENV`), so there is no real
 * credential behind it for this to protect, and the end-to-end suites drive
 * far more than ten sign-ins from the one machine that runs them — a
 * production-shaped limit here would fail the suites, not an attacker.
 */
async function claim(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  if (getServerEnv().AUTH_PROVIDER === "local") {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const start = windowStart(config);
  const storedKey = bucketKey("rate-limit", key);

  const bucket = await db.rateLimitBucket.upsert({
    where: { key_windowStart: { key: storedKey, windowStart: start } },
    create: { key: storedKey, windowStart: start, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  // Opportunistic cleanup, not a scheduled job: whichever request happens to
  // roll the low-probability dice pays for deleting windows old enough that
  // nothing still checks them. No cron, so no limit that silently stops being
  // enforced the day cron does not run — the same reasoning
  // `src/lib/usage/quota.ts` gives for rolling its period forward on use.
  if (Math.random() < 0.02) {
    const cutoff = new Date(Date.now() - config.windowMs * 4);
    void db.rateLimitBucket.deleteMany({ where: { windowStart: { lt: cutoff } } });
  }

  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((start.getTime() + config.windowMs - Date.now()) / 1000),
  );

  return { limited: bucket.count > config.limit, retryAfterSeconds };
}

/** Rate-limit one named action by the caller's IP address. */
export async function rateLimitByIp(
  action: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const ip = await clientIp();
  return claim(`${action}:ip:${ip}`, config);
}

/** Rate-limit a stable identifier (usually an email address) without storing it. */
export async function rateLimitByIdentifier(
  action: string,
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) return { limited: false, retryAfterSeconds: 0 };
  return claim(`${action}:identity:${normalized}`, config);
}

/** Apply both IP and identity limits; either one may stop the attempt. */
export async function rateLimitByIpAndIdentifier(
  action: string,
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const [ip, identity] = await Promise.all([
    rateLimitByIp(action, config),
    rateLimitByIdentifier(action, identifier, config),
  ]);

  if (!ip.limited && !identity.limited) {
    return { limited: false, retryAfterSeconds: Math.max(ip.retryAfterSeconds, identity.retryAfterSeconds) };
  }

  return {
    limited: true,
    retryAfterSeconds: Math.max(ip.retryAfterSeconds, identity.retryAfterSeconds),
  };
}

/** "3 minutes", "45 seconds" — for the message a refused attempt gets. */
export function formatRetryAfter(seconds: number): string {
  if (seconds <= 90) return `${seconds} second${seconds === 1 ? "" : "s"}`;

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
