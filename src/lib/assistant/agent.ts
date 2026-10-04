import { z } from "zod";

import type { Agent } from "@/lib/ai/types";

/**
 * The LUMEN Assistant.
 *
 * Deliberately not a chatbot. Its output is a fixed structure — insight, why it
 * matters, recommendation, next action — because the product's promise is
 * clarity and prioritisation, and free-form prose lets a model bury the useful
 * part in paragraph three.
 *
 * The schema does most of the honesty enforcement. `confidence` and
 * `missingInformation` are required fields, so the model cannot quietly skip
 * hedging when the profile is thin; it has to state what it did not know.
 */

export const assistantOutputSchema = z.object({
  /** What the situation is. One or two sentences. */
  insight: z.string().min(1),
  /** Why the operator should care. */
  whyItMatters: z.string().min(1),
  /** What to do about it. */
  recommendation: z.string().min(1),
  /** The single smallest next step. */
  nextAction: z.string().min(1),
  /**
   * How much of this rests on stored facts versus inference. Required, so a
   * confident tone can never be the default when the data is thin.
   */
  confidence: z.enum(["high", "medium", "low"]),
  /** Why that confidence level, in the operator's terms. */
  confidenceReason: z.string().min(1),
  /**
   * Data that would improve the answer. Required (may be empty) so the model
   * has to consider the question rather than omit it when inconvenient.
   */
  missingInformation: z.array(z.string()).default([]),
  /** Claims that are inference rather than recorded fact. */
  assumptions: z.array(z.string()).default([]),
});

export type AssistantAnswer = z.infer<typeof assistantOutputSchema>;

const SYSTEM = `You are LUMEN, a growth and marketing intelligence assistant.

You advise one business at a time, using only the project context supplied with
each question.

Rules you must follow:

1. Never state a business fact that is not in the context. If you do not know
   something, say so in missingInformation rather than inventing it.
2. Never present an inference as something the operator told you. Anything you
   inferred belongs in assumptions.
3. Never invent metrics, competitor facts, market sizes, benchmarks or figures.
   If a number would help, ask for it in missingInformation.
4. When context is thin, say so plainly and set confidence to low. A hedged
   honest answer is more useful than a confident invented one.
5. Be specific to this business. Advice that would apply to any company is not
   worth returning.
6. Never promise results, ROI or growth outcomes.
7. Do not reveal or describe your internal reasoning process. Return conclusions.

Write for a busy founder: direct, concrete, no marketing jargon for its own
sake. Keep each field to a few sentences at most.`;

export interface AssistantPayload {
  question: string;
  /** Prior turns, oldest first, already trimmed by the caller. */
  history: { role: "user" | "assistant"; content: string }[];
}

export const assistantAgent: Agent<AssistantPayload, AssistantAnswer> = {
  type: "assistant",
  // The assistant is the general-purpose entry point, so it asks for
  // everything; unavailable sources come back labelled rather than silently
  // missing, which is what lets it answer "what are we missing?" honestly.
  contextSources: [
    "project",
    "businessProfile",
    "strategy",
    "audience",
    "campaigns",
    "content",
    "analytics",
    "insights",
    "experimentLearnings",
  ],
  outputSchema: assistantOutputSchema,
  system: SYSTEM,
  temperature: 0.3,
  maxTokens: 1500,

  buildPrompt: (input) => {
    const history = input.payload.history
      .map((turn) => `${turn.role === "user" ? "Operator" : "You"}: ${turn.content}`)
      .join("\n");

    return [
      history ? `Earlier in this conversation:\n${history}\n` : "",
      `The operator asks: ${input.payload.question}`,
    ]
      .filter(Boolean)
      .join("\n");
  },

  summarizeInput: (input) => input.payload.question.slice(0, 200),
};

/** Plain-text rendering stored alongside the structured answer. */
export function renderAnswerText(answer: AssistantAnswer): string {
  return [
    `INSIGHT: ${answer.insight}`,
    `WHY IT MATTERS: ${answer.whyItMatters}`,
    `RECOMMENDATION: ${answer.recommendation}`,
    `NEXT ACTION: ${answer.nextAction}`,
  ].join("\n\n");
}
