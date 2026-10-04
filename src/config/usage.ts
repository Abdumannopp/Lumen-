/**
 * What an account is allowed to use, and what counts as using it.
 *
 * Both questions are configuration rather than code, because both are business
 * decisions that will change and neither should require reading a function to
 * answer.
 */

/** The one metered thing today. Billing writes to the same key. */
export const AI_RUNS_KEY = "ai.runs.monthly";

/**
 * The allowance before anyone has paid for anything.
 *
 * A trial number, not a free tier: it is what a new account gets while deciding
 * whether the product is worth paying for. Deliberately generous enough to
 * produce several weekly plans and try the other agents, and deliberately not
 * enough to run a business on for a month.
 *
 * The figure to size the paid plan against is roughly 470 AI actions a month
 * for a daily user — measured on a filled-in business, not guessed. At the
 * rates in `src/lib/usage/pricing.ts` that is a couple of dollars on Gemini
 * Flash and about fourteen on Claude Sonnet, which is the real finding: the
 * model chosen matters more to the margin than the plan's price does.
 */
export const TRIAL_AI_RUNS = 50;

/**
 * Which product feature spent the allowance.
 *
 * Coarser than the agent type on purpose. One feature can call several agents,
 * and the bill is read by feature — "the weekly plan costs us $0.60 a customer"
 * is a sentence someone can act on; "cadence costs $0.60" is not.
 */
export const FEATURES = {
  weeklyPlan: "weekly_plan",
  strategy: "strategy",
  audience: "audience",
  content: "content",
  campaigns: "campaigns",
  budget: "budget",
  intelligence: "intelligence",
  growth: "growth",
  assistant: "assistant",
  diagnostics: "diagnostics",
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

const FEATURE_LABELS: Record<string, string> = {
  weekly_plan: "Weekly plan",
  strategy: "Strategy",
  audience: "Audience",
  content: "Content",
  campaigns: "Campaigns",
  budget: "Budget",
  intelligence: "Intelligence",
  growth: "Growth",
  assistant: "Assistant",
  diagnostics: "Diagnostics",
};

export const featureLabel = (key: string) => FEATURE_LABELS[key] ?? key;

/**
 * Whether a failed run spends the allowance.
 *
 * Section 10 of the brief asks for this to be explicit in configuration rather
 * than buried in a branch, and it is worth the sentence: **a run counts once
 * the provider has been called, whether or not it succeeded.**
 *
 * The reasoning is that the money is already gone. A provider that returns
 * malformed JSON has still billed for the tokens it generated, and an allowance
 * that forgave every failure would be an allowance an unlucky week could exceed
 * without limit. What is *not* charged is a run that never reached the
 * provider — refused by this quota, or rejected before the call — because
 * nothing was spent.
 *
 * The operator is not punished for our bugs either: they are told plainly when
 * a failed run consumed part of the allowance, rather than watching the number
 * fall without explanation.
 */
export const FAILED_RUNS_COUNT_AGAINST_QUOTA = true;

/** How much of the allowance has to be left before the warning stops. */
export const LOW_ALLOWANCE_THRESHOLD = 0.2;
