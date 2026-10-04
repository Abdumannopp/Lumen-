import { z } from "zod";

import {
  BRAND_VOICE_VALUES,
  CHALLENGE_VALUES,
  CHANNEL_VALUES,
  CURRENCY_VALUES,
  SOCIAL_PLATFORMS,
} from "@/config/business-profile";
import { COUNTRY_VALUES, INDUSTRY_VALUES, MARKET_VALUES } from "@/config/project";

/**
 * Business onboarding validation.
 *
 * Two schemas, because a draft and a finished profile have different contracts:
 *
 * - `draftSchema` is deliberately permissive. Autosave fires mid-typing, so it
 *   must accept a half-filled form and never reject a save — anything malformed
 *   is dropped with `.catch()` rather than raising. Losing a keystroke to a
 *   validation error would be worse than storing an incomplete draft.
 * - `stepSchemas` are strict, and run when the person moves forward or
 *   completes. That is where required fields are actually enforced.
 *
 * The database columns are all nullable to support the first case; requiredness
 * lives here, not in the schema.
 */

/** "" and whitespace mean "not answered", which is null, not an empty string. */
const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optionalText = (max: number, label: string) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(max, `Keep ${label} under ${max} characters.`)
      .nullable()
      .optional(),
  );

const requiredText = (min: number, max: number, message: string) =>
  z.preprocess(
    emptyToNull,
    z.string({ message }).trim().min(min, message).max(max, `Keep this under ${max} characters.`),
  );

/** Accepts a bare domain and normalises to https://, like the project form. */
const urlField = (label: string) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .nullable()
      .optional()
      .refine(
        (value) => {
          if (!value) return true;
          const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
          try {
            const url = new URL(candidate);
            return Boolean(url.hostname) && url.hostname.includes(".");
          } catch {
            return false;
          }
        },
        { message: `Enter a valid ${label} link, or leave it blank.` },
      )
      .transform((value) =>
        value ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : null,
      ),
  );

const budgetAmount = z.preprocess(
  emptyToNull,
  z.coerce
    .number({ message: "Enter the budget as a number." })
    .int("Enter a whole number.")
    .min(0, "Budget cannot be negative.")
    .max(100_000_000, "That budget looks unrealistic — check the figure.")
    .nullable()
    .optional(),
);

const codeArray = (values: string[], max: number, label: string) =>
  z
    .array(z.string())
    .transform((entries) => entries.filter((entry) => values.includes(entry)))
    .refine((entries) => entries.length <= max, `Select up to ${max} ${label}.`)
    .default([]);

const competitors = z
  .array(z.string().trim().min(1).max(80))
  .max(20, "List up to 20 competitors.")
  .default([]);

const socialShape = Object.fromEntries(
  SOCIAL_PLATFORMS.map((platform) => [platform.field, urlField(platform.label)]),
) as Record<(typeof SOCIAL_PLATFORMS)[number]["field"], ReturnType<typeof urlField>>;

/** Fields owned by Project, collected here but written to the project row. */
export const projectOwnedFields = [
  "name",
  "website",
  "industry",
  "country",
  "targetMarkets",
  "description",
  "businessStage",
  "primaryGoal",
] as const;

/** Lenient shape used by autosave. Nothing here should ever throw. */
export const draftSchema = z.object({
  // Project-owned
  name: optionalText(80, "the name"),
  website: urlField("website"),
  industry: z.string().nullable().optional().catch(null),
  country: z.string().nullable().optional().catch(null),
  targetMarkets: codeArray(MARKET_VALUES, 30, "markets"),
  description: optionalText(500, "the description"),
  businessStage: z
    .enum(["IDEA", "PRE_LAUNCH", "EARLY_TRACTION", "SCALING", "ESTABLISHED"])
    .nullable()
    .optional()
    .catch(null),
  primaryGoal: z
    .enum(["AWARENESS", "ACQUISITION", "ACTIVATION", "RETENTION", "REVENUE"])
    .nullable()
    .optional()
    .catch(null),

  // Profile-owned
  productOrService: optionalText(300, "this answer"),
  businessModel: z
    .enum(["B2B", "B2C", "B2B2C", "D2C", "MARKETPLACE", "SUBSCRIPTION", "ECOMMERCE", "SERVICES", "OTHER"])
    .nullable()
    .optional()
    .catch(null),
  targetCustomers: optionalText(500, "this answer"),
  currentMarketingChannels: codeArray(CHANNEL_VALUES, 15, "channels"),
  monthlyBudgetAmount: budgetAmount.catch(null),
  monthlyBudgetCurrency: z.enum(CURRENCY_VALUES as [string, ...string[]]).nullable().optional().catch(null),
  currentChallenges: codeArray(CHALLENGE_VALUES, 14, "challenges"),
  knownCompetitors: competitors.catch([]),
  brandVoice: codeArray(BRAND_VOICE_VALUES, 12, "traits"),
  notes: optionalText(2000, "the notes"),
  ...socialShape,
});

export type ProfileDraft = z.infer<typeof draftSchema>;

/**
 * Step definitions.
 *
 * `fields` drives which inputs are validated when moving forward; `required`
 * marks the answers that cannot be skipped. Everything not listed as required
 * is optional by design — the brief asks for skippable fields, and a profile
 * that is 60% filled is still useful context.
 */
export const ONBOARDING_STEPS = [
  {
    id: "basics",
    label: "Basics",
    title: "What is the business?",
    blurb: "The essentials. Most of this you already set when you created the project.",
    schema: z.object({
      name: requiredText(2, 80, "Give the business a name of at least 2 characters."),
      website: urlField("website"),
      industry: z.enum(INDUSTRY_VALUES as [string, ...string[]], {
        message: "Choose the closest industry.",
      }),
      country: z.enum(COUNTRY_VALUES as [string, ...string[]], {
        message: "Choose where the business is based.",
      }),
      businessStage: z.enum(
        ["IDEA", "PRE_LAUNCH", "EARLY_TRACTION", "SCALING", "ESTABLISHED"],
        { message: "Choose the current stage." },
      ),
    }),
  },
  {
    id: "offering",
    label: "Offering",
    title: "What do you sell?",
    blurb: "What the customer actually buys, and how the money works.",
    schema: z.object({
      productOrService: requiredText(3, 300, "Describe what you sell."),
      description: optionalText(500, "the description"),
      businessModel: z.enum(
        ["B2B", "B2C", "B2B2C", "D2C", "MARKETPLACE", "SUBSCRIPTION", "ECOMMERCE", "SERVICES", "OTHER"],
        { message: "Choose the closest business model." },
      ),
    }),
  },
  {
    id: "customers",
    label: "Customers",
    title: "Who buys it?",
    blurb: "The more specific this is, the more useful everything downstream becomes.",
    schema: z.object({
      targetCustomers: requiredText(3, 500, "Describe who your customers are."),
      targetMarkets: codeArray(MARKET_VALUES, 30, "markets"),
    }),
  },
  {
    id: "marketing",
    label: "Marketing",
    title: "How do you reach them today?",
    blurb: "What you are already doing, and what you have to work with.",
    schema: z.object({
      primaryGoal: z.enum(
        ["AWARENESS", "ACQUISITION", "ACTIVATION", "RETENTION", "REVENUE"],
        { message: "Choose the primary goal." },
      ),
      currentMarketingChannels: codeArray(CHANNEL_VALUES, 15, "channels"),
      monthlyBudgetAmount: budgetAmount,
      monthlyBudgetCurrency: z
        .enum(CURRENCY_VALUES as [string, ...string[]])
        .nullable()
        .optional(),
    }),
  },
  {
    id: "context",
    label: "Context",
    title: "What is getting in the way?",
    blurb: "Optional, but this is what makes advice specific rather than generic.",
    schema: z.object({
      currentChallenges: codeArray(CHALLENGE_VALUES, 14, "challenges"),
      knownCompetitors: competitors,
    }),
  },
  {
    id: "brand",
    label: "Brand",
    title: "How do you sound?",
    blurb: "Optional. Useful later for anything that writes in your voice.",
    schema: z.object({
      brandVoice: codeArray(BRAND_VOICE_VALUES, 12, "traits"),
      notes: optionalText(2000, "the notes"),
      ...socialShape,
    }),
  },
  {
    id: "review",
    label: "Review",
    title: "Everything in one place",
    blurb: "Check it over. You can change any of this later from the profile page.",
    schema: z.object({}),
  },
] as const;

export const REVIEW_STEP = ONBOARDING_STEPS.length - 1;

/** Answers that must exist before a profile counts as complete. */
export const REQUIRED_FOR_COMPLETION = [
  "name",
  "industry",
  "country",
  "businessStage",
  "primaryGoal",
  "productOrService",
  "businessModel",
  "targetCustomers",
] as const;

/** Read the whole onboarding form out of a FormData. */
export function profileFormData(formData: FormData) {
  const single = (key: string) => formData.get(key);

  return {
    name: single("name"),
    website: single("website"),
    industry: single("industry"),
    country: single("country"),
    targetMarkets: formData.getAll("targetMarkets").filter(Boolean),
    description: single("description"),
    businessStage: single("businessStage"),
    primaryGoal: single("primaryGoal"),

    productOrService: single("productOrService"),
    businessModel: single("businessModel"),
    targetCustomers: single("targetCustomers"),
    currentMarketingChannels: formData.getAll("currentMarketingChannels").filter(Boolean),
    monthlyBudgetAmount: single("monthlyBudgetAmount"),
    monthlyBudgetCurrency: single("monthlyBudgetCurrency"),
    currentChallenges: formData.getAll("currentChallenges").filter(Boolean),
    knownCompetitors: formData.getAll("knownCompetitors").filter(Boolean),
    brandVoice: formData.getAll("brandVoice").filter(Boolean),
    notes: single("notes"),

    ...Object.fromEntries(
      SOCIAL_PLATFORMS.map((platform) => [platform.field, single(platform.field)]),
    ),
  };
}
