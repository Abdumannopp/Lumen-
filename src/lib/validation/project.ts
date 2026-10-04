import { z } from "zod";
import {
  COUNTRY_VALUES,
  INDUSTRY_VALUES,
  MARKET_VALUES,
} from "@/config/project";

/**
 * Project validation.
 *
 * One schema serves the create form, the edit form and the server actions, so
 * the browser and the server can never disagree about what is valid. Messages
 * are written for the person filling the form: they say what to do, not what
 * rule failed.
 */

const optionalText = (max: number, field: string) =>
  z
    .string()
    .trim()
    .max(max, `Keep ${field} under ${max} characters.`)
    .optional()
    .transform((value) => (value ? value : null));

/**
 * Accepts what people actually type ("acme.com") and normalises to a URL.
 * Rejecting a bare domain would be technically correct and practically rude.
 */
const websiteSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null))
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
    { message: "Enter a valid website, like acme.com or https://acme.com." },
  )
  .transform((value) => {
    if (!value) return null;
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  });

export const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Give the business a name of at least 2 characters.")
    .max(80, "Keep the name under 80 characters."),

  website: websiteSchema,

  industry: z.enum(INDUSTRY_VALUES as [string, ...string[]], {
    message: "Choose the closest industry.",
  }),

  country: z.enum(COUNTRY_VALUES as [string, ...string[]], {
    message: "Choose where the business is based.",
  }),

  targetMarkets: z
    .array(z.enum(MARKET_VALUES as [string, ...string[]], { message: "Unknown market." }))
    .max(30, "Select up to 30 markets. Use a region to cover several at once.")
    .default([]),

  description: optionalText(500, "the description"),

  businessStage: z.enum(
    ["IDEA", "PRE_LAUNCH", "EARLY_TRACTION", "SCALING", "ESTABLISHED"],
    { message: "Choose the current stage." },
  ),

  primaryGoal: z.enum(
    ["AWARENESS", "ACQUISITION", "ACTIVATION", "RETENTION", "REVENUE"],
    { message: "Choose the primary goal." },
  ),
});

export type ProjectInput = z.infer<typeof projectSchema>;

/** Pull a project payload out of a FormData, including repeated market fields. */
export function projectFormData(formData: FormData) {
  return {
    name: formData.get("name"),
    website: formData.get("website"),
    industry: formData.get("industry"),
    country: formData.get("country"),
    targetMarkets: formData.getAll("targetMarkets").filter(Boolean),
    description: formData.get("description"),
    businessStage: formData.get("businessStage"),
    primaryGoal: formData.get("primaryGoal"),
  };
}
