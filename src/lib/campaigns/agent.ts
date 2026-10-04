import { z } from "zod";

import type { Agent } from "@/lib/ai/types";

/**
 * ORBIT — campaign intelligence.
 *
 * Produces a campaign *plan*. LUMEN connects to no ad platform, so nothing here
 * spends money or touches a live campaign; the output is a document the
 * operator executes elsewhere.
 *
 * Budget allocation follows the same rule as the calendar's dates: the model
 * proposes proportions, the server computes the money. Models routinely return
 * splits that sum to 97% or 103%, and a budget that does not add up is worse
 * than no budget at all.
 */

const stringList = z.array(z.string().min(1));

export const CAMPAIGN_CHANNELS = [
  { key: "meta-ads", label: "Meta Ads" },
  { key: "google-ads", label: "Google Ads" },
  { key: "tiktok-ads", label: "TikTok Ads" },
  { key: "linkedin-ads", label: "LinkedIn Ads" },
  { key: "seo", label: "SEO" },
  { key: "content", label: "Content" },
  { key: "email", label: "Email" },
  { key: "influencers", label: "Influencers" },
  { key: "partnerships", label: "Partnerships" },
  { key: "events", label: "Events" },
  { key: "outbound", label: "Outbound" },
  { key: "pr", label: "PR" },
  { key: "organic-social", label: "Organic social" },
  { key: "other", label: "Other" },
] as const;

export type CampaignChannelKey = (typeof CAMPAIGN_CHANNELS)[number]["key"];

export const campaignChannelKeys = CAMPAIGN_CHANNELS.map((channel) => channel.key) as [
  CampaignChannelKey,
  ...CampaignChannelKey[],
];

export const CAMPAIGN_STATUSES = [
  { key: "DRAFT", label: "Draft" },
  { key: "PLANNED", label: "Planned" },
  { key: "ACTIVE", label: "Active" },
  { key: "PAUSED", label: "Paused" },
  { key: "COMPLETED", label: "Completed" },
] as const;

export type CampaignStatusKey = (typeof CAMPAIGN_STATUSES)[number]["key"];

export const campaignStatusKeys = CAMPAIGN_STATUSES.map((status) => status.key) as [
  CampaignStatusKey,
  ...CampaignStatusKey[],
];

export const allocationSchema = z.object({
  channel: z.enum(campaignChannelKeys),
  /** A share, not an amount. The server turns this into money. */
  percent: z.number().min(0).max(100),
  rationale: z.string().min(1),
});

export const kpiSchema = z.object({
  metric: z.string().min(1),
  /** Why this is worth watching. Never a predicted value. */
  why: z.string().min(1),
});

export const orbitOutputSchema = z.object({
  name: z.string().min(1),
  objective: z.string().min(1),
  audience: z.string().min(1),
  offer: z.string().min(1),
  channels: z.array(z.enum(campaignChannelKeys)).min(1),
  budgetAllocation: z.array(allocationSchema).min(1),
  messaging: stringList.min(1),
  creativeConcept: z.string().min(1),
  funnel: stringList.min(1),
  kpiFramework: z.array(kpiSchema).min(1),
  assumptions: stringList,
  missingInformation: stringList,
});

export type OrbitOutput = z.infer<typeof orbitOutputSchema>;

const SYSTEM = `You are ORBIT, the campaign intelligence agent inside LUMEN.

You plan one marketing campaign for one business, using only the project context
supplied with the request.

Rules:

1. Never promise a result. No projected ROAS, no "expect 3x return", no
   conversion-rate predictions. You recommend what to measure, never what the
   number will be.
2. Never invent benchmarks, industry averages or platform statistics.
3. Budget allocation is expressed as percentages that sum to 100. Give a reason
   for each share — an allocation without a rationale is a guess with a number
   attached.
4. KPIs name what to measure and why it matters. Do not set target values; the
   operator sets those from their own history.
5. Choose few channels and commit budget to them. A campaign spread thinly
   across eight channels is not a campaign.
6. Speak to the recorded audience, offer and constraints. A plan that would suit
   any business in this industry is a failure.
7. Anything you inferred rather than read goes in assumptions.
8. Do not describe your reasoning process. Return the plan.

Write plainly. Short, concrete, executable by one person.`;

export interface OrbitPayload {
  brief: string;
  budgetAmount?: number;
  budgetCurrency?: string;
  startDate?: string;
  endDate?: string;
  guidance?: string;
}

export const orbitAgent: Agent<OrbitPayload, OrbitOutput> = {
  type: "orbit",
  contextSources: [
    "project",
    "businessProfile",
    "strategy",
    "audience",
    "insights",
    "campaigns",
  ],
  outputSchema: orbitOutputSchema,
  system: SYSTEM,
  temperature: 0.5,
  maxTokens: 4000,

  buildPrompt: (input) =>
    [
      `Plan a campaign. The operator's brief: ${input.payload.brief}`,
      input.payload.budgetAmount
        ? `Total budget: ${input.payload.budgetAmount} ${input.payload.budgetCurrency ?? ""}`.trim()
        : "No budget has been set — allocate by proportion and say so in assumptions.",
      input.payload.startDate && input.payload.endDate
        ? `Runs ${input.payload.startDate} to ${input.payload.endDate}.`
        : "",
      input.payload.guidance?.trim() ? `Also: ${input.payload.guidance.trim()}` : "",
      "",
      "Return: name, objective, audience, offer, channels, budgetAllocation",
      "(percent per channel, summing to 100, each with a rationale), messaging",
      "(angles), creativeConcept, funnel (the stages a stranger passes through),",
      "kpiFramework (metric and why), assumptions, missingInformation.",
    ]
      .filter(Boolean)
      .join("\n"),

  summarizeInput: (input) => `orbit:plan — ${input.payload.brief.slice(0, 150)}`,
};

export interface NormalisedAllocation {
  channel: string;
  percent: number;
  amount: number | null;
  rationale: string;
}

/**
 * Turn proposed percentages into a split that adds up exactly.
 *
 * Percentages are rescaled to total 100, and when a budget exists the money is
 * distributed with the rounding remainder pushed onto the largest line, so the
 * sum of the parts always equals the whole. Without this the plan would show a
 * budget that silently loses or gains a few units to rounding.
 */
export function normaliseAllocation(
  entries: { channel: string; percent: number; rationale: string }[],
  totalBudget: number | null,
): NormalisedAllocation[] {
  const positive = entries.filter((entry) => entry.percent > 0);
  if (positive.length === 0) return [];

  const sum = positive.reduce((total, entry) => total + entry.percent, 0);
  const scaled = positive.map((entry) => ({
    ...entry,
    percent: Math.round((entry.percent / sum) * 1000) / 10,
  }));

  // Rounding the percentages can leave the total slightly off 100.
  const percentDrift = 100 - scaled.reduce((total, entry) => total + entry.percent, 0);
  if (Math.abs(percentDrift) >= 0.05) {
    const largest = scaled.reduce((best, entry) => (entry.percent > best.percent ? entry : best));
    largest.percent = Math.round((largest.percent + percentDrift) * 10) / 10;
  }

  if (totalBudget === null) {
    return scaled.map((entry) => ({ ...entry, amount: null }));
  }

  const withAmounts = scaled.map((entry) => ({
    ...entry,
    amount: Math.floor((entry.percent / 100) * totalBudget),
  }));

  const remainder = totalBudget - withAmounts.reduce((total, entry) => total + entry.amount, 0);
  if (remainder !== 0) {
    const largest = withAmounts.reduce((best, entry) => (entry.amount > best.amount ? entry : best));
    largest.amount += remainder;
  }

  return withAmounts;
}

/** Manual campaign entry and editing. */
export const campaignSchema = z.object({
  name: z.string().trim().min(2, "Give the campaign a name.").max(120),
  objective: z.string().trim().min(2, "Say what this campaign is for.").max(400),
  audience: z.string().trim().max(400).optional().transform((value) => value || null),
  offer: z.string().trim().max(400).optional().transform((value) => value || null),
  channels: z.array(z.enum(campaignChannelKeys)).max(14).default([]),
  totalBudgetAmount: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((value) => {
      if (value === null || value === undefined || value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
    }),
  totalBudgetCurrency: z.string().trim().max(8).optional().transform((value) => value || null),
  startDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null)
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), { message: "Enter a valid date." }),
  endDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null)
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), { message: "Enter a valid date." }),
  creativeConcept: z.string().trim().max(1000).optional().transform((value) => value || null),
  landingPage: z.string().trim().max(300).optional().transform((value) => value || null),
  status: z.enum(campaignStatusKeys),
});

export type CampaignInput = z.input<typeof campaignSchema>;

export const channelLabel = (key: string) =>
  CAMPAIGN_CHANNELS.find((channel) => channel.key === key)?.label ?? key;

export const campaignStatusLabel = (key: string) =>
  CAMPAIGN_STATUSES.find((status) => status.key === key)?.label ?? key;
