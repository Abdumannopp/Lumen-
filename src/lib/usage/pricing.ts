/**
 * What a model costs.
 *
 * Two things are true of this file at once, and both matter.
 *
 * It is **real**: the rates below were read from each vendor's own pricing page
 * on the date recorded beside them, not estimated. A cost figure invented to
 * make a dashboard look finished is worse than no cost figure, because someone
 * will price a product from it.
 *
 * It is **stale the moment it is written**: vendors change prices, and nothing
 * here finds out. So every number computed from this table is called an
 * *estimate* everywhere it is shown, the provider's invoice is treated as the
 * truth, and `checkedOn` is stored beside each rate so the question "when was
 * this last true?" has an answer rather than a shrug.
 *
 * Rates are USD per million tokens.
 */

export interface ModelRate {
  inputPerMTok: number;
  outputPerMTok: number;
  /** ISO date the rate was read from the vendor's pricing page. */
  checkedOn: string;
  source: string;
}

export const MODEL_RATES: Record<string, ModelRate> = {
  // Anthropic — platform.claude.com/docs/en/about-claude/pricing
  "claude-opus-5": {
    inputPerMTok: 5,
    outputPerMTok: 25,
    checkedOn: "2026-08-24",
    source: "platform.claude.com",
  },
  "claude-sonnet-5": {
    inputPerMTok: 2,
    outputPerMTok: 10,
    checkedOn: "2026-08-24",
    source: "platform.claude.com",
  },
  "claude-haiku-4.5": {
    inputPerMTok: 1,
    outputPerMTok: 5,
    checkedOn: "2026-08-24",
    source: "platform.claude.com",
  },

  // Google — ai.google.dev/gemini-api/docs/pricing, paid tier
  "gemini-2.5-flash": {
    inputPerMTok: 0.3,
    outputPerMTok: 2.5,
    checkedOn: "2026-08-24",
    source: "ai.google.dev",
  },
  "gemini-2.5-flash-lite": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.4,
    checkedOn: "2026-08-24",
    source: "ai.google.dev",
  },

  // Groq — console.groq.com/docs/model/openai/gpt-oss-120b
  "openai/gpt-oss-120b": {
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
    checkedOn: "2026-08-24",
    source: "console.groq.com",
  },

  // OpenRouter is deliberately NOT priced here. Every other provider in this
  // table is one vendor at one fixed rate; OpenRouter is a router, and the
  // same model id can be served by whichever backend it picks that request,
  // each at its own price — its own pricing page shows a range, not a number,
  // for a model like "openai/gpt-oss-120b". Guessing a single rate for it
  // would be exactly the wrong number this file's own docstring warns about,
  // so OpenRouter runs simply show as unpriced (`known: false`) instead.

  // The test double. Free because it is: no network call, no vendor, no bill.
  "mock-model-1": {
    inputPerMTok: 0,
    outputPerMTok: 0,
    checkedOn: "2026-08-24",
    source: "src/lib/ai/providers/mock.ts",
  },
};

export interface CostEstimate {
  usd: number;
  /** False when the model has no published rate here — see `estimateCost`. */
  known: boolean;
}

/**
 * What a run cost, from its token counts.
 *
 * Returns `known: false` for a model this table has never heard of, and a cost
 * of zero. That combination is deliberate: an unknown model must not be
 * silently priced at some default, because a wrong number spends more trust
 * than a missing one. The usage page shows the unpriced runs separately rather
 * than folding them into a total that would then be wrong.
 *
 * Null token counts — some providers do not report them — are treated as zero
 * and also mark the estimate unknown.
 */
export function estimateCost(
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
): CostEstimate {
  const rate = MODEL_RATES[model];

  if (!rate) return { usd: 0, known: false };
  if (promptTokens === null && completionTokens === null) return { usd: 0, known: false };

  const input = ((promptTokens ?? 0) / 1_000_000) * rate.inputPerMTok;
  const output = ((completionTokens ?? 0) / 1_000_000) * rate.outputPerMTok;

  // Rounded to a hundredth of a cent. Finer than that is noise on an estimate;
  // coarser loses real information on a cheap model.
  return { usd: Math.round((input + output) * 1_000_000) / 1_000_000, known: true };
}

/** For the operator, who thinks in dollars and cents rather than in floats. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return "<$0.01";

  return `$${amount.toFixed(2)}`;
}
