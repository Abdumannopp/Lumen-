import { z } from "zod";

import type { Agent } from "@/lib/ai/types";

/**
 * SCOUT — market intelligence.
 *
 * SCOUT has no internet access in this build. That is not a limitation to work
 * around, it is the safety property: every conclusion must trace back to
 * something the operator typed. A model asked about "our competitors" will
 * cheerfully recall half-remembered facts about real companies, and those facts
 * are frequently wrong and always unverifiable. So the competitor data is
 * supplied in the prompt, and the schema forces every insight to cite it.
 */

const stringList = z.array(z.string().min(1));

export const INSIGHT_KINDS = [
  {
    key: "GAP",
    label: "Competitive gaps",
    blurb: "What nobody in this set is serving well.",
  },
  {
    key: "DIFFERENTIATION",
    label: "Differentiation ideas",
    blurb: "Where this business could stand apart on purpose.",
  },
  {
    key: "OPPORTUNITY",
    label: "Opportunities",
    blurb: "Openings worth moving on.",
  },
  {
    key: "THREAT",
    label: "Threats",
    blurb: "What could go against this business.",
  },
  {
    key: "POSITIONING",
    label: "Positioning recommendations",
    blurb: "The place to claim, given who else is here.",
  },
] as const;

export type InsightKindKey = (typeof INSIGHT_KINDS)[number]["key"];

export const insightKindKeys = INSIGHT_KINDS.map((kind) => kind.key) as [
  InsightKindKey,
  ...InsightKindKey[],
];

export const insightSchema = z.object({
  kind: z.enum(insightKindKeys),
  title: z.string().min(1),
  detail: z.string().min(1),
  /**
   * What the operator recorded that supports this. Required and non-empty, so
   * an insight cannot be returned with nothing underneath it.
   */
  evidence: stringList.min(1),
  /** What SCOUT reasoned rather than read. */
  assumptions: stringList,
  /** What nobody knows yet — named, not silently skipped. */
  unknowns: stringList,
});

export type GeneratedInsight = z.infer<typeof insightSchema>;

export const scoutOutputSchema = z.object({
  insights: z.array(insightSchema).min(1).max(15),
  /** Research the operator would need to do to make this sharper. */
  researchNeeded: stringList,
});

export type ScoutOutput = z.infer<typeof scoutOutputSchema>;

const SYSTEM = `You are SCOUT, the market intelligence agent inside LUMEN.

You have NO internet access and NO knowledge of real companies. You analyse only
the competitor records and business profile supplied in this request.

Rules — the first is absolute:

1. Never state a fact about a named competitor that is not in the supplied
   records. You do not know their pricing, headcount, funding, traffic, market
   share or customers unless the operator wrote it down. If you think you
   recognise a company name, ignore that: your recollection is unverifiable and
   frequently wrong.
2. Every insight must cite, in evidence, the recorded detail it rests on. If you
   cannot cite anything, do not return the insight.
3. Anything you reasoned rather than read goes in assumptions.
4. Name what is missing in unknowns. "We do not know how they price" is a
   genuinely useful output; a guess at their pricing is not.
5. Never invent market sizes, growth rates, percentages or any figure.
6. If the recorded data is thin, say so plainly and return fewer, better-founded
   insights. Two well-grounded observations beat ten speculative ones.
7. Do not describe your reasoning process. Return the analysis.

Write plainly and specifically. An insight that would apply to any market is a
failure, not a safe default.`;

export interface ScoutPayload {
  /** Competitor records, rendered as text. SCOUT sees only this. */
  competitors: {
    name: string;
    website: string | null;
    description: string | null;
    strengths: string[];
    weaknesses: string[];
    positioning: string | null;
    pricingNotes: string | null;
    marketingNotes: string | null;
  }[];
  guidance?: string;
}

function renderCompetitor(competitor: ScoutPayload["competitors"][number]) {
  const lines = [`### ${competitor.name}`];

  if (competitor.website) lines.push(`Website: ${competitor.website}`);
  if (competitor.description) lines.push(`Description: ${competitor.description}`);
  if (competitor.strengths.length) lines.push(`Strengths: ${competitor.strengths.join("; ")}`);
  if (competitor.weaknesses.length) lines.push(`Weaknesses: ${competitor.weaknesses.join("; ")}`);
  if (competitor.positioning) lines.push(`Positioning: ${competitor.positioning}`);
  if (competitor.pricingNotes) lines.push(`Pricing notes: ${competitor.pricingNotes}`);
  if (competitor.marketingNotes) lines.push(`Marketing notes: ${competitor.marketingNotes}`);

  // Naming the gaps explicitly discourages filling them from memory.
  const missing = [
    !competitor.description && "description",
    competitor.strengths.length === 0 && "strengths",
    competitor.weaknesses.length === 0 && "weaknesses",
    !competitor.positioning && "positioning",
    !competitor.pricingNotes && "pricing",
    !competitor.marketingNotes && "marketing approach",
  ].filter(Boolean);

  if (missing.length) lines.push(`Not recorded: ${missing.join(", ")}`);

  return lines.join("\n");
}

export const scoutAgent: Agent<ScoutPayload, ScoutOutput> = {
  type: "scout",
  contextSources: ["project", "businessProfile", "strategy", "audience"],
  outputSchema: scoutOutputSchema,
  system: SYSTEM,
  temperature: 0.4,
  maxTokens: 3500,

  buildPrompt: (input) =>
    [
      "These are the competitor records the operator has entered. They are the",
      "only competitor information that exists — anything not written here is",
      "unknown, not absent.",
      "",
      input.payload.competitors.map(renderCompetitor).join("\n\n"),
      "",
      "Produce insights across these kinds: GAP, DIFFERENTIATION, OPPORTUNITY,",
      "THREAT, POSITIONING. Not every kind needs an entry if the data does not",
      "support one.",
      "",
      "Each insight needs: kind, title, detail, evidence (what recorded detail it",
      "rests on), assumptions, unknowns.",
      "",
      input.payload.guidance?.trim()
        ? `The operator asks you to keep this in mind: ${input.payload.guidance.trim()}`
        : "",
      "",
      "Also return researchNeeded: what the operator should go and find out.",
    ]
      .filter(Boolean)
      .join("\n"),

  summarizeInput: (input) => `scout:analyse — ${input.payload.competitors.length} competitors`,
};

/** Manual competitor entry. Everything except the name is optional. */
export const competitorSchema = z.object({
  name: z.string().trim().min(1, "Give the competitor a name.").max(120),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value ? value : null)),
  description: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value ? value : null)),
  strengths: stringList.max(15).default([]),
  weaknesses: stringList.max(15).default([]),
  positioning: z
    .string()
    .trim()
    .max(600)
    .optional()
    .transform((value) => (value ? value : null)),
  pricingNotes: z
    .string()
    .trim()
    .max(600)
    .optional()
    .transform((value) => (value ? value : null)),
  marketingNotes: z
    .string()
    .trim()
    .max(600)
    .optional()
    .transform((value) => (value ? value : null)),
});

export type CompetitorInput = z.input<typeof competitorSchema>;

export const insightKindLabel = (key: string) =>
  INSIGHT_KINDS.find((kind) => kind.key === key)?.label ?? key;
