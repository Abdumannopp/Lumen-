"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, CreditCard, Loader2 } from "lucide-react";

import { subscriptionStatusLabel } from "@/config/billing";
import { openBillingPortalAction, startCheckoutAction } from "@/lib/billing/actions";
import type { BillingState } from "@/lib/billing/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDayShort } from "@/lib/date";

/**
 * Plan and payment.
 *
 * Three states worth telling apart, and the interface tells them apart:
 * subscribed and fine, subscribed and the card failed, and not subscribed. The
 * second is the one products usually get wrong — either by saying nothing until
 * access disappears, or by cutting access off at the first failed retry. Here
 * the allowance is kept and the banner is loud.
 *
 * The checkout overlay is Paddle's own script, loaded only when the button is
 * pressed and only when this deployment has a client token. That keeps a
 * third-party script off every page load, and out of the test suites entirely —
 * which is why the suites can drive billing through the webhook, where the real
 * logic lives.
 */

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "outline"> = {
  ACTIVE: "success",
  TRIALING: "success",
  PAST_DUE: "danger",
  PAUSED: "warning",
  CANCELED: "outline",
};

declare global {
  interface Window {
    Paddle?: {
      Environment?: { set: (environment: string) => void };
      Initialize: (options: { token: string }) => void;
      Checkout: {
        open: (options: {
          items: { priceId: string; quantity: number }[];
          customData?: Record<string, string>;
          settings?: { successUrl?: string };
        }) => void;
      };
    };
  }
}

const PADDLE_SCRIPT = "https://cdn.paddle.com/paddle/v2/paddle.js";

function loadPaddle(): Promise<NonNullable<Window["Paddle"]>> {
  if (window.Paddle) return Promise.resolve(window.Paddle);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PADDLE_SCRIPT}"]`);
    const script = existing ?? document.createElement("script");

    script.addEventListener("load", () => {
      if (window.Paddle) resolve(window.Paddle);
      else reject(new Error("Paddle loaded without exposing its API."));
    });
    script.addEventListener("error", () => reject(new Error("Paddle could not be loaded.")));

    if (!existing) {
      script.src = PADDLE_SCRIPT;
      script.async = true;
      document.head.append(script);
    }
  });
}

export function BillingPanel({ billing }: { billing: BillingState }) {
  const [pending, startCheckout] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [openingPortal, startPortal] = useTransition();

  const manageBilling = () => {
    setMessage(null);

    startPortal(async () => {
      const result = await openBillingPortalAction();
      if (!result.ok || !result.url) {
        setMessage(result.message ?? "Billing management could not be opened.");
        return;
      }
      window.location.assign(result.url);
    });
  };

  const subscribe = () => {
    setMessage(null);

    startCheckout(async () => {
      // The action takes no arguments: the workspace comes from the session.
      const result = await startCheckoutAction();

      if (!result.ok || !result.checkout) {
        setMessage(result.message ?? "Checkout could not be started.");
        return;
      }

      try {
        const paddle = await loadPaddle();
        paddle.Environment?.set(result.checkout.environment);
        paddle.Initialize({ token: result.checkout.clientToken });
        paddle.Checkout.open({
          items: [{ priceId: result.checkout.priceId, quantity: 1 }],
          // How the webhook finds its way back to this workspace. Verified
          // against our own records when it arrives — never trusted on sight.
          customData: { workspaceId: result.checkout.workspaceId },
          settings: { successUrl: result.checkout.successUrl },
        });
      } catch {
        setMessage("The payment window could not be opened. Check your connection and try again.");
      }
    });
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-display text-base font-semibold">
              {billing.plan.name}
              {billing.status && (
                <Badge variant={STATUS_VARIANT[billing.status] ?? "outline"}>
                  {subscriptionStatusLabel(billing.status)}
                </Badge>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {billing.plan.priceLabel} per {billing.plan.interval} ·{" "}
              {billing.plan.aiRuns} AI actions a month
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {billing.manageBillingAvailable && billing.paid && (
              <Button variant="outline" onClick={manageBilling} disabled={openingPortal}>
                {openingPortal ? <Loader2 className="animate-spin" /> : <CreditCard />}
                Manage billing
              </Button>
            )}

            {!billing.paid && billing.checkoutAvailable && (
              <Button onClick={subscribe} disabled={pending || openingPortal}>
                {pending ? <Loader2 className="animate-spin" /> : <CreditCard />}
                Subscribe
              </Button>
            )}
          </div>
        </div>

        {billing.needsAttention && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              The last payment did not go through. Your allowance is unchanged while the card is
              retried — update it with your payment provider to avoid losing access.
            </span>
          </p>
        )}

        {/* Keyed on the status, not on the date. Providers do not always send
            a cancellation timestamp, and a person whose subscription ended
            should be reassured whether or not we know the exact day. */}
        {billing.status === "CANCELED" && (
          <p className="text-sm text-muted-foreground">
            {billing.canceledAt ? `Canceled on ${formatDayShort(billing.canceledAt)}. ` : "Canceled. "}
            Nothing has been deleted, and you can subscribe again whenever you like.
          </p>
        )}

        {billing.paid && billing.currentPeriodEnd && !billing.canceledAt && (
          <p className="text-sm text-muted-foreground">
            Renews {formatDayShort(billing.currentPeriodEnd)}.
          </p>
        )}

        {!billing.paid && (
          <ul className="space-y-1.5">
            {billing.plan.points.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                {point}
              </li>
            ))}
          </ul>
        )}

        {!billing.checkoutAvailable && !billing.paid && (
          <p className="text-sm text-muted-foreground">
            Checkout is not configured on this deployment, so nothing here can be bought yet.
          </p>
        )}

        {message && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
