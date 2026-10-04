"use server";

import { requireWorkspace, requireWorkspaceOwner } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { getServerEnv, clientEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Starting a checkout.
 *
 * The action takes **no arguments**, and that is the whole security design.
 *
 * A checkout that accepted a workspace id would be a checkout that could be
 * pointed at somebody else's workspace — either to charge your card for their
 * subscription, or, far worse, to attach a subscription you control to an
 * account you do not. The workspace comes from the session, through Membership,
 * exactly like every other write in the product.
 *
 * What comes back is what the browser needs to open Paddle's overlay and
 * nothing more: the public client token, the price, and the workspace id that
 * will travel in `custom_data` so the webhook can find its way home. None of it
 * is secret; the notification secret and the API key stay on the server.
 */

export interface CheckoutResult {
  ok: boolean;
  message?: string;
  checkout?: {
    clientToken: string;
    environment: "sandbox" | "production";
    priceId: string;
    /** Echoed into Paddle custom_data, and re-checked when the webhook lands. */
    workspaceId: string;
    successUrl: string;
  };
}

export async function startCheckoutAction(): Promise<CheckoutResult> {
  const { workspaceId, userId } = await requireWorkspace();
  const env = getServerEnv();

  if (!env.PADDLE_PRICE_ID || !env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) {
    return {
      ok: false,
      message: "Checkout is not configured on this deployment.",
    };
  }

  logger.info("Checkout started", { workspaceId, userId });

  return {
    ok: true,
    checkout: {
      clientToken: env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
      environment: env.PADDLE_ENVIRONMENT,
      priceId: env.PADDLE_PRICE_ID,
      workspaceId,
      /**
       * Where Paddle sends the browser afterwards.
       *
       * Deliberately a page that says "thank you, this can take a moment" and
       * not a page that grants anything. Arriving here proves the browser
       * followed a redirect; the webhook proves the payment.
       */
      successUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/settings?checkout=complete`,
    },
  };
}


export interface BillingPortalResult {
  ok: boolean;
  message?: string;
  url?: string;
}

/**
 * Create a short-lived Paddle customer portal link for the signed-in owner.
 *
 * Paddle does not include authenticated management URLs in webhook payloads
 * because their tokens are temporary. Fetching them on demand keeps those
 * tokens out of our database and avoids handing one workspace another's link.
 */
export async function openBillingPortalAction(): Promise<BillingPortalResult> {
  const { workspaceId } = await requireWorkspaceOwner();
  const env = getServerEnv();

  if (!env.PADDLE_API_KEY) {
    return {
      ok: false,
      message: "Billing management is not configured on this deployment.",
    };
  }

  const subscription = await db.subscription.findUnique({
    where: { workspaceId },
    select: { provider: true, providerSubscriptionId: true },
  });

  if (subscription?.provider !== "paddle" || !subscription.providerSubscriptionId) {
    return { ok: false, message: "No Paddle subscription is linked to this workspace." };
  }

  const baseUrl =
    env.PADDLE_ENVIRONMENT === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.PADDLE_API_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${baseUrl}/subscriptions/${encodeURIComponent(subscription.providerSubscriptionId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${env.PADDLE_API_KEY}`,
          "Paddle-Version": "1",
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      logger.warn("Paddle customer portal lookup failed", {
        workspaceId,
        status: response.status,
      });
      return {
        ok: false,
        message: "Billing management could not be opened right now. Please try again.",
      };
    }

    const body = (await response.json()) as {
      data?: { management_urls?: { view_subscription?: string | null } | null };
    };
    const url = body.data?.management_urls?.view_subscription;

    if (!url || !url.startsWith("https://buyer-portal.paddle.com/")) {
      logger.warn("Paddle customer portal response did not contain a safe portal URL", {
        workspaceId,
      });
      return {
        ok: false,
        message: "Billing management is not available for this subscription.",
      };
    }

    return { ok: true, url };
  } catch (error) {
    logger.warn("Paddle customer portal request failed", {
      workspaceId,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      message: "Billing management could not be opened right now. Please try again.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
