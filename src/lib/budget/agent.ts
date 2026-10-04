import { z } from "zod";

import type { Agent } from "@/lib/ai/types";

/**
 * Budget planning.
 *
 * The spec's hard rule — *the total allocation must always equal the total
 * budget* — is enforced here rather than trusted to the UI or the model.
 * `balanceLines()` is applied on every write, so no stored plan can be
 * internally inconsistent no matter how it was produced.
 */

export const BUDGET_CATEGORIES = [
  { key: "meta-ads", label: "Meta Ads" },
  { key: "google-ads", label: "Google Ads" },
  { key: "tiktok-ads", label: "TikTok Ads" },
  { key: "linkedin-ads", label: "LinkedIn Ads" },
  { key: "content", label: "Content" },
  { key: "influencers", label: "Influencers" },
  { key: "seo", label: "SEO" },
  { key: "email", label: "Email" },
  { key: "experiments", label: "Experiments" },
  { key: "other", label: "Other" },
] as const;

export type BudgetCategoryKey = (typeof BUDGET_CATEGORIES)[number]["key"];

export const budgetCategoryKeys = BUDGET_CATEGORIES.map((category) => category.key) as [
  BudgetCategoryKey,
  ...BudgetCategoryKey[],
];

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export type Priority = (typeof PRIORITIES)[number];

/**
 * One line of a plan.
 *
 * `why`, `role`, `risk` and `priority` are required on AI-suggested lines
 * because the spec asks for all four: a number without a reason is a guess with
 * a decimal point, and the risk is the part an operator most needs to argue
 * with before committing money.
 */
export const suggestedLineSchema = z.object({
  category: z.enum(budgetCategoryKeys),
  percent: z.number().min(0).max(100),
  why: z.string().min(1),
  role: z.string().min(1),
  risk: z.string().min(1),
  priority: z.enum(PRIORITIES),
});

export const budgetSuggestionSchema = z.object({
  lines: z.array(suggestedLineSchema).min(1),
  assumptions: z.array(z.string()),
  missingInformation: z.array(z.string()),
});

export type BudgetSuggestion = z.infer<typeof budgetSuggestionSchema>;

/** A line as stored and displayed. */
export interface BudgetLine {
  category: string;
  amount: number;
  percent: number;
  why: string;
  role: string;
  risk: string;
  priority: Priority | null;
}

const SYSTEM = `You are the budget planner inside LUMEN.

You propose how a marketing budget should be split, using only the project
context supplied with the request.

Rules:

1. Never promise ROI, revenue, payback or any guaranteed outcome. You explain
   what a channel is for and what could go wrong, not what it will return.
2. Never invent benchmarks, industry averages, platform CPMs or conversion
   rates. If a figure would help, say what the operator should measure instead.
3. Every line needs four things: why this share, the role it plays in the plan,
   the risk of spending here, and a priority. A number without them is useless.
4. Percentages must sum to 100.
5. Concentrate the budget. A small budget spread across seven channels buys
   nothing anywhere; say so plainly if the total is small.
6. Reserve something for experiments only if the budget can carry it, and say
   why if you do not.
7. Respect the recorded primary goal — an awareness budget and an acquisition
   budget do not look the same.
8. Do not describe your reasoning process. Return the allocation.

Write plainly. One or two sentences per field.`;

export interface BudgetPayload {
  total: number;
  currency: string;
  goal: string;
  availableCategories: string[];
  guidance?: string;
}

export const budgetAgent: Agent<BudgetPayload, BudgetSuggestion> = {
  type: "budget",
  contextSources: ["project", "businessProfile", "strategy", "audience", "campaigns"],
  outputSchema: budgetSuggestionSchema,
  system: SYSTEM,
  temperature: 0.4,
  maxTokens: 3000,

  buildPrompt: (input) => {
    const categories = input.payload.availableCategories
      .map((key) => BUDGET_CATEGORIES.find((category) => category.key === key)?.label ?? key)
      .join(", ");

    return [
      `Allocate a monthly marketing budget of ${input.payload.total} ${input.payload.currency}.`,
      `Primary goal: ${input.payload.goal}`,
      `Only these categories are available: ${categories}.`,
      input.payload.guidance?.trim() ? `The operator asks: ${input.payload.guidance.trim()}` : "",
      "",
      "Return `lines` — one per category you would fund, each with category,",
      "percent, why, role, risk and priority (HIGH, MEDIUM or LOW). Percentages",
      "must sum to 100. Omit categories you would not fund.",
      "",
      "Also return `assumptions` and `missingInformation`.",
    ]
      .filter(Boolean)
      .join("\n");
  },

  summarizeInput: (input) =>
    `budget:suggest — ${input.payload.total} ${input.payload.currency}, goal ${input.payload.goal}`,
};

/**
 * Force a set of lines to total the budget exactly.
 *
 * Amounts are authoritative and percentages are derived from them, because the
 * operator edits money, not proportions. The rounding remainder is pushed onto
 * the largest line so the parts always sum to the whole.
 *
 * Lines whose amount is zero are kept: "we deliberately fund nothing here" is a
 * decision worth recording, and silently dropping it would lose the rationale.
 */
export function balanceLines(
  lines: { category: string; amount: number; why?: string; role?: string; risk?: string; priority?: Priority | null }[],
  total: number,
): BudgetLine[] {
  const cleaned = lines.map((line) => ({
    category: line.category,
    amount: Math.max(0, Math.round(line.amount)),
    why: line.why ?? "",
    role: line.role ?? "",
    risk: line.risk ?? "",
    priority: line.priority ?? null,
  }));

  const sum = cleaned.reduce((running, line) => running + line.amount, 0);

  if (sum !== total && sum > 0) {
    // Rescale proportionally, then settle the remainder on the largest line.
    const scaled = cleaned.map((line) => ({
      ...line,
      amount: Math.floor((line.amount / sum) * total),
    }));

    const remainder = total - scaled.reduce((running, line) => running + line.amount, 0);
    if (remainder !== 0) {
      const largest = scaled.reduce((best, line) => (line.amount > best.amount ? line : best));
      largest.amount += remainder;
    }

    return scaled.map((line) => ({
      ...line,
      percent: total > 0 ? Math.round((line.amount / total) * 1000) / 10 : 0,
    }));
  }

  return cleaned.map((line) => ({
    ...line,
    percent: total > 0 ? Math.round((line.amount / total) * 1000) / 10 : 0,
  }));
}

/** Turn agent percentages into balanced money lines. */
export function suggestionToLines(suggestion: BudgetSuggestion, total: number): BudgetLine[] {
  const sum = suggestion.lines.reduce((running, line) => running + line.percent, 0) || 1;

  return balanceLines(
    suggestion.lines.map((line) => ({
      category: line.category,
      amount: Math.round((line.percent / sum) * total),
      why: line.why,
      role: line.role,
      risk: line.risk,
      priority: line.priority,
    })),
    total,
  );
}

export const budgetPlanSchema = z.object({
  name: z.string().trim().min(2, "Give the plan a name.").max(120),
  total: z
    .union([z.string(), z.number()])
    .transform((value) => Math.max(0, Math.round(Number(value) || 0)))
    .refine((value) => value > 0, { message: "Enter a budget greater than zero." }),
  currency: z.string().trim().min(1).max(8),
  period: z.string().trim().max(40).optional().transform((value) => value || null),
  goal: z.string().trim().max(200).optional().transform((value) => value || null),
  lines: z
    .array(
      z.object({
        category: z.enum(budgetCategoryKeys),
        amount: z.union([z.string(), z.number()]).transform((value) =>
          Math.max(0, Math.round(Number(value) || 0)),
        ),
        why: z.string().max(600).optional().default(""),
        role: z.string().max(600).optional().default(""),
        risk: z.string().max(600).optional().default(""),
        priority: z.enum(PRIORITIES).nullable().optional().default(null),
      }),
    )
    .min(1, "Add at least one line."),
});

export type BudgetPlanInput = z.input<typeof budgetPlanSchema>;

export const categoryLabel = (key: string) =>
  BUDGET_CATEGORIES.find((category) => category.key === key)?.label ?? key;
