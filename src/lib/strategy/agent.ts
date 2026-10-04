import { z } from "zod";

import type { Agent } from "@/lib/ai/types";

/**
 * ATLAS — the marketing strategy agent.
 *
 * The fourteen sections come from the product specification and are declared
 * once here. The Zod schema, the prompt, the editor UI and the version diff all
 * derive from this list, so a section cannot exist in one place and not another.
 */

export const STRATEGY_SECTIONS = [
  {
    key: "executiveSummary",
    title: "Executive summary",
    brief: "The whole strategy in a short paragraph a busy founder can act on.",
  },
  {
    key: "businessObjective",
    title: "Business objective",
    brief: "The commercial outcome marketing is serving. Not a marketing metric.",
  },
  {
    key: "marketingObjectives",
    title: "Marketing objectives",
    brief: "Two to four objectives that ladder into the business objective.",
  },
  {
    key: "targetMarket",
    title: "Target market",
    brief: "Who this is for, and deliberately who it is not for.",
  },
  {
    key: "positioning",
    title: "Positioning",
    brief: "The place this business should occupy in the customer's mind.",
  },
  {
    key: "valueProposition",
    title: "Value proposition",
    brief: "What the customer gets, in their language, not the company's.",
  },
  {
    key: "coreMessaging",
    title: "Core messaging",
    brief: "The handful of messages every channel should repeat.",
  },
  {
    key: "recommendedChannels",
    title: "Recommended channels",
    brief: "Where to show up, why each one, and what to ignore for now.",
  },
  {
    key: "contentDirection",
    title: "Content direction",
    brief: "The themes worth publishing against, and the shape of the content.",
  },
  {
    key: "acquisitionDirection",
    title: "Acquisition direction",
    brief: "How a stranger becomes a customer, step by step.",
  },
  {
    key: "budgetDirection",
    title: "Budget direction",
    brief: "Where the money should go in proportion, and what it buys.",
  },
  {
    key: "kpis",
    title: "KPIs",
    brief: "The few numbers that indicate whether this is working.",
  },
  {
    key: "priorities30Day",
    title: "30-day priorities",
    brief: "What to do first, ordered, and small enough to actually finish.",
  },
  {
    key: "roadmap90Day",
    title: "90-day roadmap",
    brief: "The arc of the quarter, in phases rather than dates.",
  },
] as const;

export type StrategySectionKey = (typeof STRATEGY_SECTIONS)[number]["key"];

export const SECTION_KEYS = STRATEGY_SECTIONS.map((section) => section.key) as [
  StrategySectionKey,
  ...StrategySectionKey[],
];

/** Whether a section's current text came from ATLAS or was written by hand. */
export const sectionSourceSchema = z.enum(["ai", "edited"]);
export type SectionSource = z.infer<typeof sectionSourceSchema>;

export const strategySectionSchema = z.object({
  key: z.enum(SECTION_KEYS),
  content: z.string().min(1),
  source: sectionSourceSchema.default("ai"),
});

export type StrategySection = z.infer<typeof strategySectionSchema>;

/** Persisted shape of a version's body. */
export const strategyBodySchema = z.object({
  sections: z.array(strategySectionSchema),
  assumptions: z.array(z.string()),
  missingInformation: z.array(z.string()),
});

export type StrategyBody = z.infer<typeof strategyBodySchema>;

/* -------------------------------------------------------------------------- */
/* Full generation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Every section is required, so a thin profile cannot cause ATLAS to quietly
 * return nine sections and let the gaps go unnoticed. If it has little to work
 * with it must still say something for each, and declare the shortfall in
 * missingInformation.
 */
const sectionsShape = Object.fromEntries(
  SECTION_KEYS.map((key) => [key, z.string().min(1)]),
) as Record<StrategySectionKey, z.ZodString>;

export const atlasOutputSchema = z.object({
  sections: z.object(sectionsShape),
  assumptions: z.array(z.string()),
  missingInformation: z.array(z.string()),
});

export type AtlasOutput = z.infer<typeof atlasOutputSchema>;

const SYSTEM = `You are ATLAS, the marketing strategy agent inside LUMEN.

You write one marketing strategy for one business, using only the project
context supplied with the request.

Rules:

1. Use only facts present in the context. Never invent market sizes, competitor
   details, customer counts, benchmarks, or any figure you were not given.
2. Anything you inferred rather than read goes in assumptions, phrased so the
   operator can confirm or correct it.
3. If a section would be better with data you do not have, name that data in
   missingInformation. Still write the section.
4. Be specific to this business. A section that would fit any company in this
   industry is a failure, not a safe default.
5. Never promise results, ROI, revenue or growth outcomes. Recommend actions and
   explain the reasoning.
6. Prefer fewer, sharper recommendations over exhaustive lists. This is a plan
   someone has to execute, probably alone.
7. Do not describe your reasoning process. Return the strategy.

Write plainly, in short paragraphs or tight lists. No filler, no jargon used for
its own sake. Each section should be two to six sentences, or a short list.`;

export interface AtlasPayload {
  /** Optional steer from the operator, e.g. "focus on organic". */
  guidance?: string;
}

export const atlasAgent: Agent<AtlasPayload, AtlasOutput> = {
  type: "atlas",
  contextSources: [
    "project",
    "businessProfile",
    "audience",
    "insights",
    "experimentLearnings",
  ],
  outputSchema: atlasOutputSchema,
  system: SYSTEM,
  temperature: 0.4,
  maxTokens: 4000,

  buildPrompt: (input) => {
    const sectionList = STRATEGY_SECTIONS.map(
      (section) => `- ${section.key}: ${section.title}. ${section.brief}`,
    ).join("\n");

    const guidance = input.payload.guidance?.trim();

    return [
      "Write a complete marketing strategy for this business.",
      "",
      "Return a JSON object with `sections`, `assumptions` and `missingInformation`.",
      "`sections` must contain every one of these keys:",
      sectionList,
      guidance ? `\nThe operator asks you to keep this in mind: ${guidance}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  },

  summarizeInput: (input) =>
    input.payload.guidance ? `atlas:generate — ${input.payload.guidance.slice(0, 150)}` : "atlas:generate",
};

/* -------------------------------------------------------------------------- */
/* Single-section regeneration                                                 */
/* -------------------------------------------------------------------------- */

export const atlasSectionOutputSchema = z.object({
  content: z.string().min(1),
  assumptions: z.array(z.string()),
});

export type AtlasSectionOutput = z.infer<typeof atlasSectionOutputSchema>;

export interface AtlasSectionPayload {
  sectionKey: StrategySectionKey;
  /** The rest of the strategy, so a rewritten section still fits the whole. */
  currentStrategy: { title: string; content: string }[];
  guidance?: string;
}

export const atlasSectionAgent: Agent<AtlasSectionPayload, AtlasSectionOutput> = {
  type: "atlas.section",
  contextSources: ["project", "businessProfile", "audience"],
  outputSchema: atlasSectionOutputSchema,
  system: `${SYSTEM}

You are rewriting a single section of an existing strategy. Keep it consistent
with the other sections you are shown — do not contradict them, and do not
restate them.`,
  temperature: 0.5,
  maxTokens: 1200,

  buildPrompt: (input) => {
    const definition = STRATEGY_SECTIONS.find(
      (section) => section.key === input.payload.sectionKey,
    );

    const rest = input.payload.currentStrategy
      .map((section) => `## ${section.title}\n${section.content}`)
      .join("\n\n");

    return [
      `Rewrite this section: ${definition?.title}.`,
      definition?.brief ?? "",
      "",
      "The rest of the current strategy, for consistency:",
      rest,
      "",
      input.payload.guidance?.trim()
        ? `The operator asks: ${input.payload.guidance.trim()}`
        : "",
      "",
      "Return JSON with `content` (the new section text) and `assumptions`.",
    ]
      .filter(Boolean)
      .join("\n");
  },

  summarizeInput: (input) => `atlas:section — ${input.payload.sectionKey}`,
};

export const sectionTitle = (key: string) =>
  STRATEGY_SECTIONS.find((section) => section.key === key)?.title ?? key;
