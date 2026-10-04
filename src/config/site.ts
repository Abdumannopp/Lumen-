/**
 * Single source of truth for product naming and canonical URLs. Metadata,
 * emails and the marketing shell all read from here so a rename is one edit.
 */
export const siteConfig = {
  name: "Lumen",
  tagline: "Your AI growth plan, every week.",
  description:
    "Lumen turns your business context into a focused weekly growth plan — what to do, why it matters, and what to measure next.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  locale: "en-US",
  supportEmail: "support@lumen.app",
} as const;

export type SiteConfig = typeof siteConfig;
