import "server-only";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { AI_RUNS_KEY, TRIAL_AI_RUNS } from "@/config/usage";

/**
 * The usage limit.
 *
 * One rule, and everything here exists to make it true: **an account over its
 * limit never reaches the provider.** Not "is billed differently", not "sees a
 * warning" — the HTTP request to the vendor is not made. A limit enforced after
 * the call is not a limit, it is a report.
 *
 * The counter lives on Entitlement rather than being derived by counting
 * AgentRun rows. Deriving it would be tidier and wrong in two ways: it would
 * cost a scan on every AI call, and it would let the limit be reset by deleting
 * history — which the product offers a button for.
 *
 * The period rolls forward on first use after it ends, not on a schedule. A
 * limit that depends on a cron job is a limit that silently stops existing the
 * first time cron does not run, and it stops existing in the direction that
 * costs money.
 */

export interface Allowance {
  key: string;
  limit: number;
  used: number;
  remaining: number;
  periodStart: Date;
  periodEnd: Date;
  exhausted: boolean;
}

/** One calendar month from `from`, at the same instant. */
function periodEndFrom(from: Date): Date {
  const end = new Date(from);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

/**
 * The workspace's current allowance, creating or rolling it as needed.
 *
 * Idempotent, and safe to call on every request. The upsert races cleanly: two
 * concurrent first-uses produce one row because `[workspaceId, key]` is unique,
 * and the loser retries into the winner's row.
 */
export async function getAllowance(workspaceId: string): Promise<Allowance> {
  const now = new Date();

  const existing = await db.entitlement.findUnique({
    where: { workspaceId_key: { workspaceId, key: AI_RUNS_KEY } },
  });

  if (!existing) {
    const created = await db.entitlement.upsert({
      where: { workspaceId_key: { workspaceId, key: AI_RUNS_KEY } },
      create: {
        workspaceId,
        key: AI_RUNS_KEY,
        limit: TRIAL_AI_RUNS,
        used: 0,
        periodStart: now,
        periodEnd: periodEndFrom(now),
      },
      update: {},
    });

    return toAllowance(created);
  }

  // The window has ended. Roll it forward and zero the counter — the limit is
  // per period, and a period that never resets is a one-off allowance.
  if (existing.periodEnd <= now) {
    const rolled = await db.entitlement.update({
      where: { id: existing.id },
      data: { used: 0, periodStart: now, periodEnd: periodEndFrom(now) },
    });

    logger.info("Usage period rolled", { workspaceId, key: AI_RUNS_KEY });

    return toAllowance(rolled);
  }

  return toAllowance(existing);
}

function toAllowance(row: {
  key: string;
  limit: number;
  used: number;
  periodStart: Date;
  periodEnd: Date;
}): Allowance {
  const remaining = Math.max(0, row.limit - row.used);

  return {
    key: row.key,
    limit: row.limit,
    used: row.used,
    remaining,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    exhausted: remaining <= 0,
  };
}

/**
 * Thrown when a run is refused for want of allowance.
 *
 * Its own type so callers can tell "you are out of allowance" — which the
 * person can act on, by waiting or upgrading — apart from "the provider
 * failed", which they cannot.
 */
export class QuotaExceededError extends Error {
  readonly allowance: Allowance;

  constructor(allowance: Allowance) {
    super("This workspace has used its AI allowance for the month.");
    this.name = "QuotaExceededError";
    this.allowance = allowance;
  }
}

/**
 * Claim one run's worth of allowance, or refuse.
 *
 * Claimed *before* the provider is called, not after it returns, and that
 * ordering is the whole point. Reserving first means a burst of concurrent
 * requests cannot each read "1 remaining" and all proceed: the conditional
 * update is atomic, so exactly one of them wins the last unit.
 *
 * The claim is released by `refundRun` when the call never happened. See
 * `FAILED_RUNS_COUNT_AGAINST_QUOTA` in src/config/usage.ts for which failures
 * are refunded and why.
 */
export async function claimRun(workspaceId: string): Promise<Allowance> {
  const allowance = await getAllowance(workspaceId);

  if (allowance.exhausted) {
    logger.warn("AI run refused: allowance exhausted", {
      workspaceId,
      limit: allowance.limit,
      used: allowance.used,
    });

    throw new QuotaExceededError(allowance);
  }

  // Conditional on `used` still being below the limit, so two requests racing
  // for the last unit cannot both succeed. `updateMany` returns a count rather
  // than throwing, which is how the loser finds out.
  const claimed = await db.entitlement.updateMany({
    where: { workspaceId, key: AI_RUNS_KEY, used: { lt: allowance.limit } },
    data: { used: { increment: 1 } },
  });

  if (claimed.count === 0) {
    const fresh = await getAllowance(workspaceId);
    throw new QuotaExceededError(fresh);
  }

  return {
    ...allowance,
    used: allowance.used + 1,
    remaining: Math.max(0, allowance.remaining - 1),
    exhausted: allowance.remaining - 1 <= 0,
  };
}

/**
 * Give a claimed run back.
 *
 * Only for a run that never reached the provider — a request rejected before
 * the call, or a claim made and then abandoned. A failure that reached the
 * provider is not refunded: the tokens were generated and billed regardless of
 * what came back.
 *
 * Floors at zero, because a double refund must not hand out free allowance.
 */
export async function refundRun(workspaceId: string): Promise<void> {
  await db.entitlement.updateMany({
    where: { workspaceId, key: AI_RUNS_KEY, used: { gt: 0 } },
    data: { used: { decrement: 1 } },
  });
}
