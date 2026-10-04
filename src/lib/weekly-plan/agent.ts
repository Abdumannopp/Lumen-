import { z } from "zod";

import { MAX_TASKS, MIN_TASKS, TASK_PRIORITIES } from "@/config/weekly-plan";
import { MARKETING_CHANNELS, channelLabel } from "@/config/business-profile";
import type { Agent } from "@/lib/ai/types";

/**
 * CADENCE — the weekly plan.
 *
 * The other agents describe a business. This one tells its operator what to do
 * on Monday, which is a different and harder job: everything it returns has to
 * survive contact with one person, one week, and whatever budget they actually
 * have.
 *
 * Its hazard is the plausible plan. A list of marketing activities is easy to
 * generate and reads well; a list somebody can finish by Friday is not. So the
 * schema refuses anything vague — a task without steps, without an expected
 * result, or without a reason is not a task — and the guardrails in
 * `guardrails.ts` throw away whatever the model returns that the business
 * cannot act on, before any of it is written down.
 *
 * The model is asked for the plan. It is not trusted to enforce the rules.
 */

const line = (max: number) => z.string().trim().min(1).max(max);

export const CHANNEL_CODES = MARKETING_CHANNELS.map((option) => option.value) as [
  string,
  ...string[],
];

export const generatedTaskSchema = z.object({
  /** What to do, as one imperative sentence. */
  title: line(120),
  /** Why it is worth this week, in this business's terms. */
  why: line(400),
  /** The actual steps. Ordered. At least one, or it is a theme not a task. */
  steps: z.array(line(240)).min(1).max(8),
  /** A channel code. Anything else is dropped by the guardrails. */
  channel: z.enum(CHANNEL_CODES),
  priority: z.enum(TASK_PRIORITIES),
  /** What the operator should expect to see. Never phrased as a promise. */
  expectedResult: line(300),
  /**
   * What this rests on. May be empty — a task with no evidence is honest about
   * having none, which is better than a fabricated citation.
   */
  evidence: z
    .array(
      z.object({
        claim: line(300),
        sourceUrl: z.string().trim().max(500).nullable().optional(),
        sourceTitle: z.string().trim().max(200).nullable().optional(),
        confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
      }),
    )
    .max(4)
    .default([]),
});

export type GeneratedTask = z.infer<typeof generatedTaskSchema>;

export const cadenceOutputSchema = z.object({
  tasks: z.array(generatedTaskSchema).min(MIN_TASKS).max(MAX_TASKS + 3),
  /** What would make next week's plan better. Shown, not hidden. */
  missingInformation: z.array(line(200)).default([]),
});

export type CadenceOutput = z.infer<typeof cadenceOutputSchema>;

const SYSTEM = `You are CADENCE, the weekly planning agent inside LUMEN.

You are given everything recorded about one business. You return a short list of
marketing work its operator can finish this week.

Assume one person, a few hours, and no marketing team.

Rules:

1. Every task is something a person starts and finishes. "Improve SEO" is a
   theme. "Rewrite the three highest-traffic page titles to lead with the
   problem" is a task.
2. Steps are the actual steps, in order. If you cannot write the steps, you do
   not have a task yet.
3. expectedResult says what the operator should expect to see, and never
   promises a number you cannot support. "More enquiries by Friday" is a lie.
   "You will know within two weeks whether the page converts" is not.
4. Only use channels this business has said it uses, or that need no budget.
   Never propose paid advertising for a business with no budget.
5. Never invent a statistic, a benchmark or a competitor's result. Every claim
   in evidence must be one you can attribute; if you cannot, return no evidence
   for that task rather than a plausible-sounding source.
6. Fewer, sharper tasks. Three that get done beat eight that do not.
7. If the business marked a task DONE last week, build on it. If it SKIPPED one,
   do not repeat it — the skip reason says why, and you do not get to overrule
   it with the same suggestion in different words.
8. Do not describe your reasoning. Return the plan.

Write plainly, in the second person, to the person who has to do the work.`;

export interface CadencePayload {
  /** The Monday this plan covers, as YYYY-MM-DD. */
  weekStart: string;
  /** Channel codes the plan may use, already narrowed by budget. */
  allowedChannels: string[];
  /** True when the business has no money to spend this month. */
  zeroBudget: boolean;
  /** Titles marked DONE on the previous plan. */
  completed: string[];
  /** Outcomes explicitly recorded against tasks completed on the previous plan. */
  completedOutcomes: { title: string; outcome: string }[];
  /** Titles marked SKIPPED on the previous plan, with the reason given. */
  skipped: { title: string; reason: string }[];
  /** Anything the operator typed when asking for the plan. */
  guidance?: string;
}

export const cadenceAgent: Agent<CadencePayload, CadenceOutput> = {
  type: "cadence",
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
  outputSchema: cadenceOutputSchema,
  system: SYSTEM,
  temperature: 0.4,
  maxTokens: 4000,

  buildPrompt: (input) => {
    const { payload } = input;

    return [
      `Plan the week beginning ${payload.weekStart}.`,
      "",
      payload.zeroBudget
        ? "This business has no budget this month. Do not propose anything that costs money — no advertising, no sponsorship, no paid tools."
        : "",
      "",
      "Channels you may use:",
      ...payload.allowedChannels.map((code) => `- ${code} (${channelLabel(code)})`),
      "",
      "Use no other channel. A task on a channel not in that list is discarded.",
      "",
      payload.completed.length
        ? ["Finished last week — build on these rather than repeating them:", ...payload.completed.map((t) => `- ${t}`)].join("\n")
        : "",
      payload.completedOutcomes.length
        ? [
            "Observed outcomes recorded by the operator — use these as context, not as guaranteed causation:",
            ...payload.completedOutcomes.map((item) => `- ${item.title}: ${item.outcome}`),
          ].join("\n")
        : "",
      "",
      payload.skipped.length
        ? [
            "Skipped last week, with the operator's reason. Do not suggest these again:",
            ...payload.skipped.map((t) => `- ${t.title} (${t.reason})`),
          ].join("\n")
        : "",
      "",
      payload.guidance?.trim() ? `The operator asks: ${payload.guidance.trim()}` : "",
      "",
      `Return between ${MIN_TASKS} and ${MAX_TASKS} tasks, most important first. Each needs:`,
      "title, why, steps, channel, priority, expectedResult, and evidence (which may be empty).",
      "",
      "Also return missingInformation: what would make next week's plan better.",
    ]
      .filter((part) => part !== "")
      .join("\n");
  },

  summarizeInput: (input) =>
    `cadence:plan ${input.payload.weekStart}${input.payload.zeroBudget ? " zero-budget" : ""}`,
};
