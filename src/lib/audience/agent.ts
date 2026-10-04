import { z } from "zod";

import type { Agent } from "@/lib/ai/types";

/**
 * PULSE — the audience intelligence agent.
 *
 * The hardest constraint in this phase is the spec's: *do not invent precise
 * demographic facts without evidence*. Prompt wording alone will not hold that
 * line, so the schema enforces it structurally: ICP attributes are free-text
 * label/value pairs each carrying its own `basis`, which is either `stated`
 * (the operator told us) or `inferred` (PULSE reasoned it). A model cannot emit
 * "ages 25–34, household income $80k" without also declaring it as inference.
 */

const stringList = z.array(z.string().min(1));

export const attributeSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  /** Whether this came from the profile or was reasoned. */
  basis: z.enum(["stated", "inferred"]),
});

export type IcpAttribute = z.infer<typeof attributeSchema>;

export const personaSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  snapshot: z.string().min(1),
  goals: stringList,
  painPoints: stringList,
  objections: stringList,
  channels: stringList,
});

export const icpSchema = z.object({
  attributes: z.array(attributeSchema),
  qualifyingSignals: stringList,
  disqualifiers: stringList,
});

export const segmentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  kind: z.enum(["B2B", "B2C"]),
  painPoints: stringList,
  motivations: stringList,
  buyingTriggers: stringList,
  objections: stringList,
  preferredChannels: stringList,
  messagingAngles: stringList,
  /** What this segment rests on. Required, so no segment arrives unexplained. */
  evidenceNote: z.string().min(1),
  icp: icpSchema,
  personas: z.array(personaSchema).min(1).max(3),
});

export type GeneratedSegment = z.infer<typeof segmentSchema>;

export const pulseOutputSchema = z.object({
  segments: z.array(segmentSchema).min(1).max(5),
  missingInformation: stringList,
});

export type PulseOutput = z.infer<typeof pulseOutputSchema>;

const SYSTEM = `You are PULSE, the audience intelligence agent inside LUMEN.

You describe who a business sells to, using only the project context supplied
with the request.

Rules:

1. Never state a demographic or firmographic fact as certain unless it is in the
   context. Every ICP attribute must be marked "stated" only if it came from the
   business profile; anything you reasoned is "inferred".
2. Never invent market sizes, percentages, salary figures, headcounts or any
   other number you were not given. If a range would help, describe it
   qualitatively instead.
3. Every segment needs an evidenceNote saying plainly what it rests on — for
   example "inferred from the product description and stated target customers".
4. Prefer two or three sharp segments over five vague ones. Segments that
   overlap heavily are one segment described twice.
5. Personas are illustrative individuals, not real people. Give them a plausible
   role and situation; do not fabricate biographical detail.
6. Objections are what would stop this person buying. Include the uncomfortable
   ones, not just price.
7. Do not describe your reasoning process. Return the analysis.

Write plainly and specifically. A segment that would fit any company in this
industry is a failure, not a safe default.`;

export interface PulsePayload {
  guidance?: string;
}

export const pulseAgent: Agent<PulsePayload, PulseOutput> = {
  type: "pulse",
  contextSources: ["project", "businessProfile", "strategy", "insights"],
  outputSchema: pulseOutputSchema,
  system: SYSTEM,
  temperature: 0.5,
  maxTokens: 4000,

  buildPrompt: (input) =>
    [
      "Identify the audience segments for this business.",
      "",
      "For each segment return: name, description, kind (B2B or B2C), painPoints,",
      "motivations, buyingTriggers, objections, preferredChannels, messagingAngles,",
      "evidenceNote, an icp (attributes with basis, qualifyingSignals, disqualifiers),",
      "and one to three personas.",
      "",
      "Use B2B attributes (company size, industry, buying roles, maturity) for B2B",
      "segments and consumer attributes (life stage, situation, interests) for B2C.",
      "",
      input.payload.guidance?.trim()
        ? `The operator asks you to keep this in mind: ${input.payload.guidance.trim()}`
        : "",
      "",
      "Also return missingInformation: what would make this analysis sharper.",
    ]
      .filter(Boolean)
      .join("\n"),

  summarizeInput: (input) =>
    input.payload.guidance ? `pulse:generate — ${input.payload.guidance.slice(0, 150)}` : "pulse:generate",
};

/** Fields the manual segment editor accepts. */
export const manualSegmentSchema = z.object({
  name: z.string().trim().min(2, "Give the segment a name.").max(80),
  description: z.string().trim().min(3, "Describe who this segment is.").max(600),
  kind: z.enum(["B2B", "B2C"]),
  painPoints: stringList.max(12).default([]),
  motivations: stringList.max(12).default([]),
  buyingTriggers: stringList.max(12).default([]),
  objections: stringList.max(12).default([]),
  preferredChannels: stringList.max(12).default([]),
  messagingAngles: stringList.max(12).default([]),
});

export type ManualSegmentInput = z.infer<typeof manualSegmentSchema>;
