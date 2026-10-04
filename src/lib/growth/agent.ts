import { z } from "zod";

import type { Agent, AgentContext } from "@/lib/ai/types";

/**
 * ASCEND — growth intelligence.
 *
 * The last agent in the loop, and the only one that reads everything: profile,
 * strategy, audience, competitors, content, campaigns, recorded performance and
 * past experiment learnings.
 *
 * Its specific hazard is false certainty. A recommendation reads as authoritative
 * whether it rests on thirty days of measured performance or on a business
 * profile alone, so `clampConfidence()` caps what a recommendation may claim
 * against how much evidence actually exists. The model cannot talk its way past
 * that ceiling.
 */

const stringList = z.array(z.string().min(1));

export const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export const LEVELS = ["HIGH", "MEDIUM", "LOW"] as const;

export type RecommendationPriorityKey = (typeof PRIORITIES)[number];
export type LevelKey = (typeof LEVELS)[number];

export const RECOMMENDATION_STATUSES = [
  { key: "OPEN", label: "Open" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "DONE", label: "Done" },
  { key: "DISMISSED", label: "Dismissed" },
] as const;

export type RecommendationStatusKey = (typeof RECOMMENDATION_STATUSES)[number]["key"];

export const recommendationStatusKeys = RECOMMENDATION_STATUSES.map((status) => status.key) as [
  RecommendationStatusKey,
  ...RecommendationStatusKey[],
];

export const generatedRecommendationSchema = z.object({
  title: z.string().min(1),
  /** What is happening. */
  insight: z.string().min(1),
  /** Why it matters. */
  reason: z.string().min(1),
  /** What to do about it — one concrete action, not a theme. */
  action: z.string().min(1),
  priority: z.enum(PRIORITIES),
  impact: z.enum(LEVELS),
  effort: z.enum(LEVELS),
  confidence: z.enum(LEVELS),
  /** Required: a confidence level without a reason is a number with no meaning. */
  confidenceReason: z.string().min(1),
  /** Which context sources this rests on. */
  basedOn: stringList.min(1),
});

export type GeneratedRecommendation = z.infer<typeof generatedRecommendationSchema>;

export const ascendOutputSchema = z.object({
  recommendations: z.array(generatedRecommendationSchema).min(1).max(12),
  /** Data that would let ASCEND say more, or say it with more confidence. */
  missingInformation: stringList,
});

export type AscendOutput = z.infer<typeof ascendOutputSchema>;

const SYSTEM = `You are ASCEND, the growth intelligence agent inside LUMEN.

You read everything recorded about one business and decide what it should do
next.

Rules:

1. Never invent a number, a benchmark or a result. If performance data is
   present, cite it; if it is absent, say so rather than assuming.
2. In the analytics context, null means "not recorded", never zero. Do not treat
   a null as a failure or as a result of any kind.
3. Confidence must be earned. Say HIGH only when recorded performance data
   supports the claim. Reasoning from a business profile alone is LOW, and the
   confidenceReason must say which evidence you used.
4. Every recommendation needs one concrete action someone could start on Monday.
   "Improve your positioning" is a theme, not an action.
5. Weigh effort honestly. A HIGH-impact, HIGH-effort item is not automatically
   the priority for a business with one operator.
6. Prefer few sharp recommendations over an exhaustive list. Ten items nobody
   does is worse than three that get done.
7. Do not promise outcomes. Recommend the move and name the risk.
8. Do not describe your reasoning process. Return the recommendations.

Write plainly and specifically to this business.`;

export interface AscendPayload {
  guidance?: string;
}

export const ascendAgent: Agent<AscendPayload, AscendOutput> = {
  type: "ascend",
  // Everything. ASCEND is the point at which the loop closes.
  contextSources: [
    "project",
    "businessProfile",
    "strategy",
    "audience",
    "insights",
    "content",
    "campaigns",
    "analytics",
    "experimentLearnings",
    "aiLearning",
  ],
  outputSchema: ascendOutputSchema,
  system: SYSTEM,
  temperature: 0.5,
  maxTokens: 4000,

  buildPrompt: (input) =>
    [
      "Decide what this business should do next to grow.",
      "",
      "Cover growth opportunities, problems worth fixing, and optimisations —",
      "whatever the recorded evidence actually supports. Do not force one of each.",
      "",
      "Each recommendation needs: title, insight (what is happening), reason (why",
      "it matters), action (one concrete next step), priority, impact, effort,",
      "confidence, confidenceReason, and basedOn (which context sources it rests on).",
      "",
      input.payload.guidance?.trim() ? `The operator asks: ${input.payload.guidance.trim()}` : "",
      "",
      "Also return missingInformation: what would let you say more, or say it with",
      "more confidence.",
    ]
      .filter(Boolean)
      .join("\n"),

  summarizeInput: (input) =>
    input.payload.guidance ? `ascend:advise — ${input.payload.guidance.slice(0, 150)}` : "ascend:advise",
};

/* -------------------------------------------------------------------------- */
/* Confidence ceiling                                                          */
/* -------------------------------------------------------------------------- */

export interface EvidenceProfile {
  hasAnalytics: boolean;
  hasExperimentLearnings: boolean;
  hasStrategy: boolean;
  hasAudience: boolean;
  hasLearningSignals: boolean;
  /** Sources that actually carried data. */
  sources: string[];
}

/** Read what the gathered context genuinely contains. */
export function readEvidence(context: AgentContext): EvidenceProfile {
  const included = new Set(
    context.slices.filter((slice) => slice.status === "included").map((slice) => slice.source),
  );

  const learningSlice = context.slices.find((slice) => slice.source === "aiLearning" && slice.status === "included");
  const learningData = learningSlice?.data as {
    recentLessons?: unknown[];
    recommendationDecisions?: { decided?: number };
    execution?: { completed?: number; skipped?: number };
    feedback?: { responses?: number };
  } | undefined;

  const hasLearningSignals = Boolean(
    learningData && (
      (learningData.recentLessons?.length ?? 0) > 0 ||
      (learningData.recommendationDecisions?.decided ?? 0) > 0 ||
      ((learningData.execution?.completed ?? 0) + (learningData.execution?.skipped ?? 0)) > 0 ||
      (learningData.feedback?.responses ?? 0) > 0
    ),
  );

  return {
    hasAnalytics: included.has("analytics"),
    hasExperimentLearnings: included.has("experimentLearnings"),
    hasStrategy: included.has("strategy"),
    hasAudience: included.has("audience"),
    hasLearningSignals,
    sources: [...included],
  };
}

const LEVEL_ORDER: Record<LevelKey, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/**
 * The most a recommendation may claim, given what exists.
 *
 * Measured performance is the only thing that earns HIGH. Structured qualitative
 * context (a strategy, defined segments) earns MEDIUM. A business profile alone
 * earns LOW — that is reasoning from a description, and describing it as
 * high-confidence would be the exact false certainty the spec forbids.
 */
export function maxConfidence(evidence: EvidenceProfile): LevelKey {
  if (evidence.hasAnalytics || evidence.hasExperimentLearnings) return "HIGH";
  if (evidence.hasStrategy || evidence.hasAudience || evidence.hasLearningSignals) return "MEDIUM";
  return "LOW";
}

export function clampConfidence(
  claimed: LevelKey,
  ceiling: LevelKey,
): { level: LevelKey; clamped: boolean } {
  if (LEVEL_ORDER[claimed] <= LEVEL_ORDER[ceiling]) return { level: claimed, clamped: false };
  return { level: ceiling, clamped: true };
}

/** Appended to the reason when a claim was capped, so the change is visible. */
export function clampNote(ceiling: LevelKey): string {
  return ceiling === "LOW"
    ? " (Capped: no strategy, audience or performance data is recorded, so this rests on the business profile alone.)"
    : " (Capped: no recorded performance data supports a higher confidence.)";
}

/** Manual recommendation entry and editing. */
export const recommendationSchema = z.object({
  title: z.string().trim().min(2, "Give the recommendation a title.").max(160),
  insight: z.string().trim().min(2, "Say what is happening.").max(1000),
  reason: z.string().trim().min(2, "Say why it matters.").max(1000),
  action: z.string().trim().min(2, "Say what to do.").max(1000),
  priority: z.enum(PRIORITIES),
  impact: z.enum(LEVELS),
  effort: z.enum(LEVELS),
  confidence: z.enum(LEVELS),
  confidenceReason: z.string().trim().min(2, "Explain the confidence level.").max(600),
  status: z.enum(recommendationStatusKeys),
});

export type RecommendationInput = z.input<typeof recommendationSchema>;

export const statusLabel = (key: string) =>
  RECOMMENDATION_STATUSES.find((status) => status.key === key)?.label ?? key;
