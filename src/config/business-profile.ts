import type { BusinessModel } from "@/generated/prisma/enums";
import type { Option } from "@/config/project";

/**
 * Option lists for the business profile.
 *
 * Same principle as the project lists: data, not enums, except where the value
 * is structural enough to belong in the database. One source of truth for both
 * the form UI and server-side validation.
 */

export const BUSINESS_MODELS: Option<BusinessModel>[] = [
  { value: "B2B", label: "B2B — selling to other businesses" },
  { value: "B2C", label: "B2C — selling to consumers" },
  { value: "B2B2C", label: "B2B2C — through a business, to their customers" },
  { value: "D2C", label: "D2C — direct to consumer, no middlemen" },
  { value: "MARKETPLACE", label: "Marketplace — connecting buyers and sellers" },
  { value: "SUBSCRIPTION", label: "Subscription — recurring revenue" },
  { value: "ECOMMERCE", label: "E-commerce — online storefront" },
  { value: "SERVICES", label: "Services — billed by project or retainer" },
  { value: "OTHER", label: "Other" },
];

export const BUSINESS_MODEL_SHORT: Record<BusinessModel, string> = {
  B2B: "B2B",
  B2C: "B2C",
  B2B2C: "B2B2C",
  D2C: "D2C",
  MARKETPLACE: "Marketplace",
  SUBSCRIPTION: "Subscription",
  ECOMMERCE: "E-commerce",
  SERVICES: "Services",
  OTHER: "Other",
};

/** Channels a business might already be using. */
export const MARKETING_CHANNELS: Option[] = [
  { value: "seo", label: "SEO / organic search" },
  { value: "content", label: "Content marketing" },
  { value: "paid-search", label: "Paid search" },
  { value: "paid-social", label: "Paid social" },
  { value: "organic-social", label: "Organic social" },
  { value: "email", label: "Email marketing" },
  { value: "influencer", label: "Influencer / creator" },
  { value: "affiliate", label: "Affiliate & partnerships" },
  { value: "events", label: "Events & conferences" },
  { value: "outbound", label: "Outbound sales" },
  { value: "pr", label: "PR & media" },
  { value: "community", label: "Community" },
  { value: "referral", label: "Referral & word of mouth" },
  { value: "marketplace", label: "Marketplaces & app stores" },
  { value: "offline", label: "Offline / print / retail" },
];

/** Framed as the operator would describe them, not as marketing jargon. */
export const BUSINESS_CHALLENGES: Option[] = [
  { value: "not-enough-traffic", label: "Not enough traffic" },
  { value: "traffic-not-converting", label: "Traffic that doesn't convert" },
  { value: "high-cac", label: "Acquisition costs too high" },
  { value: "churn", label: "Customers churning" },
  { value: "unclear-positioning", label: "Unclear positioning" },
  { value: "no-attribution", label: "Can't tell what's working" },
  { value: "small-budget", label: "Budget too small to compete" },
  { value: "no-time", label: "No time to execute" },
  { value: "small-team", label: "Team too small" },
  { value: "long-sales-cycle", label: "Sales cycle too long" },
  { value: "strong-competition", label: "Strong competition" },
  { value: "seasonality", label: "Seasonal swings" },
  { value: "content-consistency", label: "Publishing consistently" },
  { value: "brand-awareness", label: "Nobody knows we exist" },
];

/** Tone traits, pickable in combination — voice is rarely a single adjective. */
export const BRAND_VOICE_TRAITS: Option[] = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "authoritative", label: "Authoritative" },
  { value: "technical", label: "Technical" },
  { value: "playful", label: "Playful" },
  { value: "bold", label: "Bold" },
  { value: "empathetic", label: "Empathetic" },
  { value: "minimal", label: "Minimal" },
  { value: "witty", label: "Witty" },
  { value: "inspirational", label: "Inspirational" },
  { value: "straight-talking", label: "Straight-talking" },
  { value: "premium", label: "Premium" },
];

export const CURRENCIES: Option[] = [
  { value: "USD", label: "USD — US dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — Pound sterling" },
  { value: "CAD", label: "CAD — Canadian dollar" },
  { value: "AUD", label: "AUD — Australian dollar" },
  { value: "CHF", label: "CHF — Swiss franc" },
  { value: "SEK", label: "SEK — Swedish krona" },
  { value: "PLN", label: "PLN — Polish złoty" },
  { value: "TRY", label: "TRY — Turkish lira" },
  { value: "AED", label: "AED — UAE dirham" },
  { value: "INR", label: "INR — Indian rupee" },
  { value: "SGD", label: "SGD — Singapore dollar" },
  { value: "JPY", label: "JPY — Japanese yen" },
  { value: "BRL", label: "BRL — Brazilian real" },
  { value: "MXN", label: "MXN — Mexican peso" },
  { value: "ZAR", label: "ZAR — South African rand" },
  { value: "NGN", label: "NGN — Nigerian naira" },
  { value: "UZS", label: "UZS — Uzbek sum" },
];

/** Social platforms, mapped to their column on BusinessProfile. */
export const SOCIAL_PLATFORMS = [
  { field: "linkedinUrl", label: "LinkedIn", placeholder: "linkedin.com/company/acme" },
  { field: "xUrl", label: "X", placeholder: "x.com/acme" },
  { field: "instagramUrl", label: "Instagram", placeholder: "instagram.com/acme" },
  { field: "facebookUrl", label: "Facebook", placeholder: "facebook.com/acme" },
  { field: "youtubeUrl", label: "YouTube", placeholder: "youtube.com/@acme" },
  { field: "tiktokUrl", label: "TikTok", placeholder: "tiktok.com/@acme" },
] as const;

export type SocialField = (typeof SOCIAL_PLATFORMS)[number]["field"];

const lookup = (options: Option[]) =>
  Object.fromEntries(options.map((option) => [option.value, option.label]));

const CHANNEL_LABELS = lookup(MARKETING_CHANNELS);
const CHALLENGE_LABELS = lookup(BUSINESS_CHALLENGES);
const VOICE_LABELS = lookup(BRAND_VOICE_TRAITS);

export const channelLabel = (value: string) => CHANNEL_LABELS[value] ?? value;
export const challengeLabel = (value: string) => CHALLENGE_LABELS[value] ?? value;
export const brandVoiceLabel = (value: string) => VOICE_LABELS[value] ?? value;

export const CHANNEL_VALUES = MARKETING_CHANNELS.map((option) => option.value);
export const CHALLENGE_VALUES = BUSINESS_CHALLENGES.map((option) => option.value);
export const BRAND_VOICE_VALUES = BRAND_VOICE_TRAITS.map((option) => option.value);
export const CURRENCY_VALUES = CURRENCIES.map((option) => option.value);
