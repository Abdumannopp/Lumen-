/**
 * The plan.
 *
 * One plan, deliberately. Several plans is a pricing page, a comparison table,
 * an upgrade path, a downgrade path, and four ways for entitlements to end up
 * inconsistent — before a single customer has told us what they would pay for.
 *
 * ## Where the numbers come from
 *
 * Step 08 measured what an AI action costs. A daily user makes roughly 470 a
 * month, and at the rates in `src/lib/usage/pricing.ts` that is about $0.50 on
 * Gemini Flash-Lite, $2.40 on Gemini Flash and $14 on Claude Sonnet. The
 * finding worth keeping is that **the model chosen moves the margin more than
 * the price does**, which is why the quota below is expressed in AI actions
 * rather than in dollars: it is the unit the cost actually scales with.
 *
 * 500 actions covers the measured heavy user with room to spare. At the Gemini
 * rates the AI cost of a fully-used month is under $3, which leaves the price
 * paying for the product rather than for the tokens.
 *
 * ## Changing the price
 *
 * `PLAN.priceLabel` is display only. The amount actually charged lives in
 * Paddle, keyed by `PADDLE_PRICE_ID` — so changing this string changes what the
 * page says and not what the card is charged. Change both, in that order, and
 * check them against each other; a page that advertises one number while the
 * checkout charges another is the kind of mistake that ends in refunds.
 */

export const PLAN = {
  key: "lumen-monthly",
  name: "Lumen",
  priceLabel: "$19",
  interval: "month",
  /** AI actions per month while the subscription is active. */
  aiRuns: 500,
  /** Written for the person deciding, not for a comparison table. */
  points: [
    "A weekly marketing plan you can actually finish",
    "500 AI actions a month",
    "Strategy, audience, content, campaigns and growth",
    "Your data stays yours — export it whenever you like",
  ],
} as const;

/**
 * What happens when a payment fails.
 *
 * Paddle retries a failed charge over several days before giving up. Cutting a
 * paying customer off the moment the first retry fails would punish them for
 * an expired card, so `PAST_DUE` keeps the paid allowance and the interface
 * says plainly that payment failed and needs attention.
 *
 * `CANCELED` and `PAUSED` are different: those are decisions, not accidents.
 * The allowance drops back to the trial figure — access is not revoked, and
 * nothing is deleted.
 */
export const PAST_DUE_KEEPS_ACCESS = true;

/** Statuses that grant the paid allowance. */
export const PAID_STATUSES = ["ACTIVE", "TRIALING", ...(PAST_DUE_KEEPS_ACCESS ? ["PAST_DUE"] : [])];

/**
 * How stale a webhook may be before it is refused.
 *
 * Paddle's own SDKs enforce five seconds. That is tight enough that ordinary
 * clock drift between two machines can reject a legitimate event, so this is
 * wider — and still far inside any window that makes a captured request worth
 * replaying, given the signature covers the body as well as the timestamp.
 */
export const WEBHOOK_TOLERANCE_SECONDS = 60;

const STATUS_LABELS: Record<string, string> = {
  TRIALING: "Trial",
  ACTIVE: "Active",
  PAST_DUE: "Payment failed",
  PAUSED: "Paused",
  CANCELED: "Canceled",
};

export const subscriptionStatusLabel = (status: string) => STATUS_LABELS[status] ?? status;
