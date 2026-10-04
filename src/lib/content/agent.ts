import { z } from "zod";

import type { Agent } from "@/lib/ai/types";

/**
 * MUSE — content and creative.
 *
 * The spec lists nine functions (ideas, pillars, posts, captions, hooks, CTAs,
 * scripts, ad copy, briefs). They are not nine agents: they are one generation
 * shaped by platform and type, because a TikTok script and a LinkedIn post
 * differ in form, not in what MUSE needs to know.
 */

const stringList = z.array(z.string().min(1));

export const PLATFORMS = [
  { key: "INSTAGRAM", label: "Instagram", note: "Visual-first. Hook lands in the first line." },
  { key: "TIKTOK", label: "TikTok", note: "Spoken, fast. The first two seconds decide." },
  { key: "LINKEDIN", label: "LinkedIn", note: "Professional, specific. No engagement bait." },
  { key: "YOUTUBE", label: "YouTube", note: "Longer form. Earn the watch time." },
  { key: "FACEBOOK", label: "Facebook", note: "Conversational, community-oriented." },
  { key: "X", label: "X", note: "Compressed. One idea, sharply put." },
  { key: "EMAIL", label: "Email", note: "Subject line is the hook. Written to one person." },
  { key: "BLOG", label: "Blog", note: "Depth and structure. Answers a real question." },
] as const;

export type PlatformKey = (typeof PLATFORMS)[number]["key"];

export const platformKeys = PLATFORMS.map((platform) => platform.key) as [
  PlatformKey,
  ...PlatformKey[],
];

export const CONTENT_TYPES = [
  { key: "POST", label: "Post" },
  { key: "SHORT_VIDEO_SCRIPT", label: "Short video script" },
  { key: "AD_COPY", label: "Ad copy" },
  { key: "EMAIL", label: "Email" },
  { key: "ARTICLE", label: "Article" },
  { key: "CREATIVE_BRIEF", label: "Creative brief" },
] as const;

export type ContentTypeKey = (typeof CONTENT_TYPES)[number]["key"];

export const contentTypeKeys = CONTENT_TYPES.map((type) => type.key) as [
  ContentTypeKey,
  ...ContentTypeKey[],
];

export const CONTENT_STATUSES = [
  { key: "IDEA", label: "Idea" },
  { key: "DRAFT", label: "Draft" },
  { key: "APPROVED", label: "Approved" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "PUBLISHED", label: "Published" },
] as const;

export type ContentStatusKey = (typeof CONTENT_STATUSES)[number]["key"];

export const contentStatusKeys = CONTENT_STATUSES.map((status) => status.key) as [
  ContentStatusKey,
  ...ContentStatusKey[],
];

export const generatedItemSchema = z.object({
  platform: z.enum(platformKeys),
  type: z.enum(contentTypeKeys),
  objective: z.string().min(1),
  audience: z.string().min(1),
  pillar: z.string().min(1),
  /** The opening line. Judged separately because it does most of the work. */
  hook: z.string().min(1),
  body: z.string().min(1),
  cta: z.string().min(1),
});

export type GeneratedContentItem = z.infer<typeof generatedItemSchema>;

export const museOutputSchema = z.object({
  /** Themes the items belong to, so a plan has shape rather than being a list. */
  pillars: stringList,
  items: z.array(generatedItemSchema).min(1).max(12),
  /** What would make the next batch better. */
  notes: stringList,
});

export type MuseOutput = z.infer<typeof museOutputSchema>;

const SYSTEM = `You are MUSE, the content and creative agent inside LUMEN.

You write marketing content for one business, using only the project context
supplied with the request.

Rules:

1. Write in the business's brand voice if one is recorded. If none is recorded,
   write plainly and say so in notes — do not invent a personality.
2. Never claim a result, statistic, customer count, award or testimonial. If a
   piece would be stronger with a number, write it so the operator can drop
   their own in, and note that in notes.
3. Never promise outcomes. No "10x your revenue".
4. Speak to the recorded audience and their actual objections. Content that
   would suit any company in this industry is a failure.
5. The hook must be able to stand alone. If it only makes sense after the body,
   it is not a hook.
6. The CTA must be a single specific action, not "learn more".
7. Match the platform. A TikTok script is spoken; a LinkedIn post is read; an
   email is written to one person.
8. Do not describe your reasoning process. Return the content.

Write like a person, not a brand deck. Short sentences. No filler openings like
"In today's fast-paced world".`;

export interface MusePayload {
  platform: PlatformKey;
  type: ContentTypeKey;
  count: number;
  objective?: string;
  guidance?: string;
}

export const museAgent: Agent<MusePayload, MuseOutput> = {
  type: "muse",
  // Strategy and audience are requested because the spec requires content to be
  // built on them; if they are empty the context says so and MUSE hedges.
  contextSources: ["project", "businessProfile", "strategy", "audience", "content"],
  outputSchema: museOutputSchema,
  system: SYSTEM,
  temperature: 0.8,
  maxTokens: 4000,

  buildPrompt: (input) => {
    const platform = PLATFORMS.find((entry) => entry.key === input.payload.platform);
    const type = CONTENT_TYPES.find((entry) => entry.key === input.payload.type);

    return [
      `Write ${input.payload.count} ${type?.label.toLowerCase()} item(s) for ${platform?.label}.`,
      platform?.note ? `Platform character: ${platform.note}` : "",
      input.payload.objective?.trim()
        ? `Objective: ${input.payload.objective.trim()}`
        : "Choose objectives that serve the recorded marketing goal.",
      input.payload.guidance?.trim() ? `The operator asks: ${input.payload.guidance.trim()}` : "",
      "",
      "For each item return: platform, type, objective, audience (which recorded",
      "segment it speaks to), pillar (its content theme), hook, body, cta.",
      "",
      "Also return `pillars` (the themes across this batch) and `notes`.",
    ]
      .filter(Boolean)
      .join("\n");
  },

  summarizeInput: (input) =>
    `muse:${input.payload.platform.toLowerCase()}/${input.payload.type.toLowerCase()} ×${input.payload.count}`,
};

/** Manual content entry and editing. */
export const contentItemSchema = z.object({
  platform: z.enum(platformKeys),
  type: z.enum(contentTypeKeys),
  status: z.enum(contentStatusKeys),
  objective: z.string().trim().min(2, "Say what this piece is for.").max(200),
  audience: z.string().trim().max(200).optional().transform((value) => value || null),
  pillar: z.string().trim().max(120).optional().transform((value) => value || null),
  hook: z.string().trim().max(500).optional().transform((value) => value || null),
  body: z.string().trim().max(8000).optional().transform((value) => value || null),
  cta: z.string().trim().max(300).optional().transform((value) => value || null),
  scheduledAt: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), {
      message: "Enter a valid date.",
    }),
});

export type ContentItemInput = z.input<typeof contentItemSchema>;

export const platformLabel = (key: string) =>
  PLATFORMS.find((platform) => platform.key === key)?.label ?? key;

export const contentTypeLabel = (key: string) =>
  CONTENT_TYPES.find((type) => type.key === key)?.label ?? key;

export const contentStatusLabel = (key: string) =>
  CONTENT_STATUSES.find((status) => status.key === key)?.label ?? key;
