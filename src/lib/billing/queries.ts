import "server-only";

import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";
import { getServerEnv } from "@/lib/env";
import { PAID_STATUSES, PLAN } from "@/config/billing";
import type { SubscriptionStatus } from "@/generated/prisma/enums";

/**
 * Billing reads.
 *
 * Scoped to the caller's workspace like everything else. "What is anyone else
 * paying" is not a question this product answers.
 */

export interface BillingState {
  /** Null before anyone has subscribed. */
  status: SubscriptionStatus | null;
  /** Whether the paid allowance applies right now. */
  paid: boolean;
  /** True when payment failed and Paddle is still retrying. */
  needsAttention: boolean;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  /** False when checkout is not configured on this deployment. */
  checkoutAvailable: boolean;
  /** Owner-only customer portal is available when the server can create a temporary link. */
  manageBillingAvailable: boolean;
  plan: { name: string; priceLabel: string; interval: string; aiRuns: number; points: readonly string[] };
}

export async function getBillingState(): Promise<BillingState> {
  const { workspaceId, role } = await requireWorkspace();
  const env = getServerEnv();

  const subscription = await db.subscription.findUnique({
    where: { workspaceId },
    select: { status: true, currentPeriodEnd: true, canceledAt: true, providerSubscriptionId: true },
  });

  const status = subscription?.status ?? null;

  return {
    status,
    paid: status ? PAID_STATUSES.includes(status) : false,
    needsAttention: status === "PAST_DUE",
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    canceledAt: subscription?.canceledAt ?? null,
    // Both halves, because one without the other cannot open a checkout —
    // env.ts refuses to boot with only one, so this is really "is it set up".
    checkoutAvailable: Boolean(env.PADDLE_PRICE_ID && env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN),
    manageBillingAvailable: role === "OWNER" && Boolean(env.PADDLE_API_KEY && subscription?.providerSubscriptionId),
    plan: {
      name: PLAN.name,
      priceLabel: PLAN.priceLabel,
      interval: PLAN.interval,
      aiRuns: PLAN.aiRuns,
      points: PLAN.points,
    },
  };
}
