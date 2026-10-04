import "server-only";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getServerEnv } from "@/lib/env";
import { PAID_STATUSES, PLAN } from "@/config/billing";
import { PRODUCT_EVENTS, trackProductEvent } from "@/lib/product-analytics/events";
import { AI_RUNS_KEY, TRIAL_AI_RUNS } from "@/config/usage";
import {
  priceIdFromEvent,
  workspaceIdFromEvent,
  type PaddleEvent,
} from "@/lib/billing/webhook";
import type { SubscriptionStatus } from "@/generated/prisma/enums";

/**
 * What a verified webhook does to the product.
 *
 * The whole of billing's effect on Lumen is one number: the workspace's AI
 * allowance. Nothing else in the codebase knows that billing exists — the plan
 * page, the runtime and the quota all read Entitlement, and Entitlement is
 * written here. That is what keeps "we changed the plan" from being a change to
 * eight files.
 *
 * Everything in this file assumes the signature has already been verified. It
 * is not exported to anywhere that could call it otherwise.
 */

/**
 * A date from a payload we did not write.
 *
 * `new Date("nonsense")` is an Invalid Date, which compares false against
 * everything and throws only when Prisma tries to serialise it — so a single
 * malformed timestamp would turn a webhook into a 500 and, because the event id
 * is already claimed, into an event that can never be retried. Found exactly
 * that way, by a test fixture with a stray quote in it.
 */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** Paddle's status strings, mapped to ours. Anything unknown is not a status. */
const STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "ACTIVE",
  trialing: "TRIALING",
  past_due: "PAST_DUE",
  paused: "PAUSED",
  canceled: "CANCELED",
};

/**
 * Event types that change a subscription's state.
 *
 * A fixed list rather than a prefix match. `subscription.` covers events we
 * have never seen and whose meaning we would be guessing at, and guessing about
 * the event that grants access is exactly the wrong place to be generous.
 */
const HANDLED = new Set([
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.trialing",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
]);

export interface ApplyResult {
  status: "PROCESSED" | "IGNORED" | "FAILED";
  result: string;
  workspaceId: string | null;
}

/**
 * Set the workspace's allowance to match its subscription.
 *
 * `used` is deliberately left alone. Someone upgrading mid-month has already
 * spent what they spent; zeroing the counter would hand out a second month's
 * allowance for the price of one, and zeroing it on a downgrade would take back
 * actions already used. The limit moves; the meter does not.
 */
async function applyEntitlementWithClient(
  dbClient: Pick<typeof db, "entitlement">,
  workspaceId: string,
  status: SubscriptionStatus,
  periodStart: Date | null,
  periodEnd: Date | null,
): Promise<number> {
  const limit = PAID_STATUSES.includes(status) ? PLAN.aiRuns : TRIAL_AI_RUNS;
  const now = new Date();
  const effectiveStart = periodStart ?? now;
  const effectiveEnd = periodEnd ?? (() => {
    const end = new Date(effectiveStart);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return end;
  })();

  const existing = await dbClient.entitlement.findUnique({
    where: { workspaceId_key: { workspaceId, key: AI_RUNS_KEY } },
    select: { id: true, used: true, periodStart: true, periodEnd: true },
  });

  if (!existing) {
    await dbClient.entitlement.create({
      data: {
        workspaceId,
        key: AI_RUNS_KEY,
        limit,
        used: 0,
        periodStart: effectiveStart,
        periodEnd: effectiveEnd,
      },
    });
    return limit;
  }

  // Paddle's billing period is authoritative. A renewal moves the window and
  // resets the meter exactly once. Without this, a customer's `used` count
  // would carry across paid months until a product request happened to roll it.
  const newPeriod = effectiveStart.getTime() > existing.periodStart.getTime();

  await dbClient.entitlement.update({
    where: { id: existing.id },
    data: {
      limit,
      ...(newPeriod
        ? { used: 0, periodStart: effectiveStart, periodEnd: effectiveEnd }
        : periodStart
          ? { periodStart: effectiveStart, periodEnd: effectiveEnd }
          : {}),
    },
  });

  return limit;
}

/**
 * Apply one verified event.
 *
 * Returns rather than throws, because the caller records the outcome on the
 * WebhookEvent row and answers the provider either way. A webhook endpoint that
 * throws gets retried forever for a problem retrying cannot fix.
 */
export async function applyPaddleEvent(event: PaddleEvent): Promise<ApplyResult> {
  if (!HANDLED.has(event.event_type)) {
    return { status: "IGNORED", result: `No handler for ${event.event_type}.`, workspaceId: null };
  }

  const providerSubscriptionId = event.data.id ?? null;
  const rawStatus = event.data.status ?? "";
  const status = STATUS_MAP[rawStatus];

  if (!status) {
    return {
      status: "FAILED",
      result: `Unrecognised subscription status "${rawStatus}".`,
      workspaceId: null,
    };
  }

  // Two ways to find the workspace, in order of trustworthiness.
  //
  // The subscription id is best: it was recorded by an earlier event we already
  // verified, so it is our own record talking. custom_data is the fallback, and
  // is only consulted for a subscription we have not seen before — which is the
  // one case where there is nothing of ours to match against.
  let workspaceId: string | null = null;

  if (providerSubscriptionId) {
    const existing = await db.subscription.findUnique({
      where: { providerSubscriptionId },
      select: { workspaceId: true },
    });
    workspaceId = existing?.workspaceId ?? null;
  }

  if (!workspaceId) {
    const claimed = workspaceIdFromEvent(event);

    if (claimed) {
      // Looked up rather than trusted. An id in a payload naming a workspace
      // that does not exist is not a reason to create one.
      const workspace = await db.workspace.findUnique({
        where: { id: claimed },
        select: { id: true },
      });
      workspaceId = workspace?.id ?? null;

      if (!workspace) {
        logger.warn("Webhook named a workspace that does not exist", {
          eventType: event.event_type,
          providerSubscriptionId,
        });
      }
    }
  }

  if (!workspaceId) {
    // A webhook for an account we no longer have is not an application error.
    // Acknowledging it prevents an endless provider retry loop for a permanent
    // mismatch such as a deleted workspace.
    return {
      status: "IGNORED",
      result: "No matching Lumen workspace was found for this subscription.",
      workspaceId: null,
    };
  }

  const periodStart = toDate(event.data.current_billing_period?.starts_at);
  const periodEnd = toDate(event.data.current_billing_period?.ends_at);
  const canceledAt = toDate(event.data.canceled_at);
  const eventOccurredAt = toDate(event.occurred_at) ?? new Date();
  const eventPriceId = priceIdFromEvent(event);
  const env = getServerEnv();

  const transactionResult = await db.$transaction(async (tx) => {
    const current = await tx.subscription.findUnique({
      where: { workspaceId },
      select: { providerSubscriptionId: true, status: true, lastEventOccurredAt: true },
    });

    if (current?.lastEventOccurredAt && eventOccurredAt <= current.lastEventOccurredAt) {
      return { ignored: true as const, limit: null, reason: "Out-of-order Paddle event was older than the subscription state already applied." };
    }

    // Never let a second live subscription replace the current one. A different
    // provider subscription is accepted only after the prior one is canceled,
    // which covers an intentional re-subscribe flow.
    if (
      current?.providerSubscriptionId &&
      current.providerSubscriptionId !== providerSubscriptionId &&
      current.status !== "CANCELED"
    ) {
      return { ignored: true as const, limit: null, reason: "The workspace already has a different active subscription." };
    }

    await tx.subscription.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        provider: "paddle",
        providerSubscriptionId,
        providerCustomerId: event.data.customer_id ?? null,
        priceId: eventPriceId,
        status,
        lastEventOccurredAt: eventOccurredAt,
        currentPeriodEnd: periodEnd,
        canceledAt,
      },
      update: {
        providerSubscriptionId,
        providerCustomerId: event.data.customer_id ?? null,
        priceId: eventPriceId ?? undefined,
        status,
        lastEventOccurredAt: eventOccurredAt,
        currentPeriodEnd: periodEnd,
        canceledAt,
      },
    });

    const limit = await applyEntitlementWithClient(tx, workspaceId, status, periodStart, periodEnd);

    await tx.auditEvent.create({
      data: {
        workspaceId,
        actorId: null,
        action: "billing.subscription.updated",
        subjectType: "subscription",
        subjectId: providerSubscriptionId,
        detail: { eventType: event.event_type, status, limit },
      },
    });

    return { ignored: false as const, limit, reason: "" };
  });

  if (transactionResult.ignored) {
    return { status: "IGNORED", result: transactionResult.reason, workspaceId };
  }

  const limit = transactionResult.limit;

  if (PAID_STATUSES.includes(status)) {
    await trackProductEvent({
      workspaceId,
      eventName: PRODUCT_EVENTS.SUBSCRIPTION_ACTIVE,
      metadata: { status },
    });
  }

  logger.info("Subscription updated from webhook", {
    workspaceId,
    eventType: event.event_type,
    status,
    limit,
  });

  return { status: "PROCESSED", result: `${status}, allowance ${limit}.`, workspaceId };
}
