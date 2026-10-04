import { z } from "zod";

import type { Agent } from "@/lib/ai/types";
import { endOfDay, startOfDay } from "@/lib/date";
import { PLATFORMS, contentTypeKeys, platformKeys } from "@/lib/content/agent";

/**
 * Content plan generation.
 *
 * The model writes the content; **the server computes the dates**. Language
 * models are unreliable at calendar arithmetic — they skip weekends
 * inconsistently, miscount intervals and occasionally emit dates outside the
 * requested range. Asking for a `slot` index instead makes the failure mode
 * impossible: whatever the model returns, the schedule is derived from the
 * range and frequency the operator actually chose.
 */

const stringList = z.array(z.string().min(1));

export const plannedItemSchema = z.object({
  /** 0-based position in the posting sequence, not a date. */
  slot: z.number().int().min(0),
  platform: z.enum(platformKeys),
  type: z.enum(contentTypeKeys),
  objective: z.string().min(1),
  audience: z.string().min(1),
  pillar: z.string().min(1),
  hook: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
});

export type PlannedItem = z.infer<typeof plannedItemSchema>;

export const contentPlanOutputSchema = z.object({
  pillars: stringList,
  items: z.array(plannedItemSchema).min(1).max(60),
  notes: stringList,
});

export type ContentPlanOutput = z.infer<typeof contentPlanOutputSchema>;

export const POSTING_FREQUENCIES = [
  { key: "DAILY", label: "Every day", perWeek: 7 },
  { key: "FIVE_PER_WEEK", label: "5× a week (weekdays)", perWeek: 5 },
  { key: "THREE_PER_WEEK", label: "3× a week", perWeek: 3 },
  { key: "TWICE_WEEKLY", label: "2× a week", perWeek: 2 },
  { key: "WEEKLY", label: "Once a week", perWeek: 1 },
] as const;

export type FrequencyKey = (typeof POSTING_FREQUENCIES)[number]["key"];

export const frequencyKeys = POSTING_FREQUENCIES.map((frequency) => frequency.key) as [
  FrequencyKey,
  ...FrequencyKey[],
];

const SYSTEM = `You are MUSE, planning a content calendar for one business.

You write the content. You do NOT choose dates — each item carries a slot
number, and the operator's schedule decides when that slot falls.

Rules:

1. Write in the business's recorded brand voice. If none is recorded, write
   plainly rather than inventing a personality.
2. Never claim a result, statistic, customer count, award or testimonial, and
   never promise an outcome.
3. Build the plan around a small number of pillars so it reads as a campaign
   rather than a pile of unrelated posts. Return those pillars.
4. Vary the angle across slots. Repeating one idea in five wordings is padding.
5. Speak to the recorded audience and their real objections.
6. Every hook must stand alone; every CTA must be one specific action.
7. Match each platform's form. Do not write one post and relabel it.
8. Do not describe your reasoning process. Return the plan.`;

export interface ContentPlanPayload {
  goal: string;
  platforms: string[];
  slotCount: number;
  audience?: string;
  guidance?: string;
  /** Included only so the copy can reference the period in general terms. */
  rangeDescription: string;
}

export const contentPlanAgent: Agent<ContentPlanPayload, ContentPlanOutput> = {
  type: "muse.plan",
  contextSources: ["project", "businessProfile", "strategy", "audience", "content"],
  outputSchema: contentPlanOutputSchema,
  system: SYSTEM,
  temperature: 0.8,
  maxTokens: 8000,

  buildPrompt: (input) => {
    const platforms = input.payload.platforms
      .map((key) => PLATFORMS.find((platform) => platform.key === key))
      .filter(Boolean)
      .map((platform) => `${platform!.label} — ${platform!.note}`)
      .join("\n");

    return [
      `Plan ${input.payload.slotCount} pieces of content for ${input.payload.rangeDescription}.`,
      `Goal: ${input.payload.goal}`,
      "",
      "Platforms to use, rotating sensibly between them:",
      platforms,
      "",
      input.payload.audience?.trim() ? `Focus on this audience: ${input.payload.audience.trim()}` : "",
      input.payload.guidance?.trim() ? `The operator asks: ${input.payload.guidance.trim()}` : "",
      "",
      `Return items with slot numbers 0 to ${input.payload.slotCount - 1}, one per slot.`,
      "Each item needs: slot, platform, type, objective, audience, pillar, hook, body, cta.",
      "Also return `pillars` and `notes`.",
    ]
      .filter(Boolean)
      .join("\n");
  },

  summarizeInput: (input) =>
    `muse:plan — ${input.payload.slotCount} slots, ${input.payload.platforms.length} platforms`,
};

/**
 * Build the posting dates for a range.
 *
 * Weekday-only frequencies skip Saturday and Sunday rather than shifting them,
 * because a plan that quietly moves work onto a weekend is worse than one that
 * posts less often. Returns dates in order; the caller maps slots onto them.
 */
export function buildSchedule(
  from: Date,
  to: Date,
  frequency: FrequencyKey,
  maxSlots = 60,
): Date[] {
  const perWeek = POSTING_FREQUENCIES.find((entry) => entry.key === frequency)?.perWeek ?? 3;

  // Which weekdays to use, chosen to spread evenly rather than cluster.
  const weekdayPattern: Record<number, number[]> = {
    7: [0, 1, 2, 3, 4, 5, 6],
    5: [1, 2, 3, 4, 5],
    3: [1, 3, 5],
    2: [2, 4],
    1: [2],
  };

  const allowed = new Set(weekdayPattern[perWeek] ?? [1, 3, 5]);
  const dates: Date[] = [];

  // Walked in UTC, because `scheduledAt` is a day pinned to UTC midnight (see
  // src/lib/date.ts). Stepping in local time shifted every generated date by a
  // day east of UTC, which also moved posts onto the weekend the weekday-only
  // frequencies exist to avoid.
  const cursor = startOfDay(from);
  const end = endOfDay(to);

  while (cursor <= end && dates.length < maxSlots) {
    if (allowed.has(cursor.getUTCDay())) dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}
