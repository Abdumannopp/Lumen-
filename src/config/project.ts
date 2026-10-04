import type { BusinessStage, PrimaryGoal } from "@/generated/prisma/enums";

/**
 * Option lists for project fields.
 *
 * These are data, not enums in the database (except stage and goal), because
 * industry and geography lists change far more often than schema should. Every
 * list here is the single source of truth for both the form UI and server-side
 * validation, so the two can never disagree about what is acceptable.
 */

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

/** Coarse enough to be pickable, specific enough to be useful. */
export const INDUSTRIES: Option[] = [
  { value: "saas", label: "SaaS & software" },
  { value: "ecommerce", label: "E-commerce & retail" },
  { value: "marketplace", label: "Marketplace" },
  { value: "fintech", label: "Fintech & financial services" },
  { value: "health", label: "Health & wellness" },
  { value: "education", label: "Education & training" },
  { value: "media", label: "Media & publishing" },
  { value: "agency", label: "Agency & consulting" },
  { value: "professional-services", label: "Professional services" },
  { value: "hospitality", label: "Hospitality & travel" },
  { value: "food-beverage", label: "Food & beverage" },
  { value: "real-estate", label: "Real estate & property" },
  { value: "manufacturing", label: "Manufacturing & industrial" },
  { value: "logistics", label: "Logistics & supply chain" },
  { value: "energy", label: "Energy & sustainability" },
  { value: "nonprofit", label: "Non-profit & social impact" },
  { value: "gaming", label: "Gaming & entertainment" },
  { value: "creator", label: "Creator & subscription" },
  { value: "other", label: "Other" },
];

/**
 * Countries the business can be based in. Curated rather than the full ISO
 * list — extend this array to add one, nothing else needs to change.
 */
export const COUNTRIES: Option[] = [
  { value: "AE", label: "United Arab Emirates" },
  { value: "AR", label: "Argentina" },
  { value: "AT", label: "Austria" },
  { value: "AU", label: "Australia" },
  { value: "BD", label: "Bangladesh" },
  { value: "BE", label: "Belgium" },
  { value: "BR", label: "Brazil" },
  { value: "CA", label: "Canada" },
  { value: "CH", label: "Switzerland" },
  { value: "CL", label: "Chile" },
  { value: "CN", label: "China" },
  { value: "CO", label: "Colombia" },
  { value: "CZ", label: "Czechia" },
  { value: "DE", label: "Germany" },
  { value: "DK", label: "Denmark" },
  { value: "EE", label: "Estonia" },
  { value: "EG", label: "Egypt" },
  { value: "ES", label: "Spain" },
  { value: "FI", label: "Finland" },
  { value: "FR", label: "France" },
  { value: "GB", label: "United Kingdom" },
  { value: "GE", label: "Georgia" },
  { value: "GH", label: "Ghana" },
  { value: "GR", label: "Greece" },
  { value: "HK", label: "Hong Kong SAR" },
  { value: "HR", label: "Croatia" },
  { value: "HU", label: "Hungary" },
  { value: "ID", label: "Indonesia" },
  { value: "IE", label: "Ireland" },
  { value: "IL", label: "Israel" },
  { value: "IN", label: "India" },
  { value: "IT", label: "Italy" },
  { value: "JP", label: "Japan" },
  { value: "KE", label: "Kenya" },
  { value: "KR", label: "South Korea" },
  { value: "KZ", label: "Kazakhstan" },
  { value: "LT", label: "Lithuania" },
  { value: "LV", label: "Latvia" },
  { value: "MA", label: "Morocco" },
  { value: "MX", label: "Mexico" },
  { value: "MY", label: "Malaysia" },
  { value: "NG", label: "Nigeria" },
  { value: "NL", label: "Netherlands" },
  { value: "NO", label: "Norway" },
  { value: "NZ", label: "New Zealand" },
  { value: "PE", label: "Peru" },
  { value: "PH", label: "Philippines" },
  { value: "PK", label: "Pakistan" },
  { value: "PL", label: "Poland" },
  { value: "PT", label: "Portugal" },
  { value: "RO", label: "Romania" },
  { value: "RS", label: "Serbia" },
  { value: "SA", label: "Saudi Arabia" },
  { value: "SE", label: "Sweden" },
  { value: "SG", label: "Singapore" },
  { value: "SI", label: "Slovenia" },
  { value: "SK", label: "Slovakia" },
  { value: "TH", label: "Thailand" },
  { value: "TR", label: "Türkiye" },
  { value: "TW", label: "Taiwan" },
  { value: "UA", label: "Ukraine" },
  { value: "US", label: "United States" },
  { value: "UY", label: "Uruguay" },
  { value: "UZ", label: "Uzbekistan" },
  { value: "VN", label: "Vietnam" },
  { value: "ZA", label: "South Africa" },
];

/**
 * Markets a business sells into.
 *
 * Regions are included alongside countries because "we sell across Western
 * Europe" is a real answer, and forcing it to be expressed as eighteen
 * checkboxes would lose the intent. Region codes are prefixed `R-` so they can
 * never collide with an ISO country code.
 */
export interface MarketOption extends Option {
  group: "Reach" | "Regions" | "Countries";
}

export const MARKETS: MarketOption[] = [
  { value: "R-WW", label: "Worldwide", group: "Reach" },

  { value: "R-NA", label: "North America", group: "Regions" },
  { value: "R-LATAM", label: "Latin America", group: "Regions" },
  { value: "R-EU-W", label: "Western Europe", group: "Regions" },
  { value: "R-EU-E", label: "Central & Eastern Europe", group: "Regions" },
  { value: "R-UK-IE", label: "UK & Ireland", group: "Regions" },
  { value: "R-NORDIC", label: "Nordics", group: "Regions" },
  { value: "R-MENA", label: "Middle East & North Africa", group: "Regions" },
  { value: "R-SSA", label: "Sub-Saharan Africa", group: "Regions" },
  { value: "R-SA", label: "South Asia", group: "Regions" },
  { value: "R-SEA", label: "Southeast Asia", group: "Regions" },
  { value: "R-EA", label: "East Asia", group: "Regions" },
  { value: "R-ANZ", label: "Australia & New Zealand", group: "Regions" },

  ...COUNTRIES.map((country): MarketOption => ({ ...country, group: "Countries" })),
];

export const BUSINESS_STAGES: Option<BusinessStage>[] = [
  { value: "IDEA", label: "Idea — validating the concept" },
  { value: "PRE_LAUNCH", label: "Pre-launch — building, not yet selling" },
  { value: "EARLY_TRACTION", label: "Early traction — first customers" },
  { value: "SCALING", label: "Scaling — growing repeatably" },
  { value: "ESTABLISHED", label: "Established — mature operation" },
];

export const PRIMARY_GOALS: Option<PrimaryGoal>[] = [
  { value: "AWARENESS", label: "Awareness — get known by the right people" },
  { value: "ACQUISITION", label: "Acquisition — bring in new customers" },
  { value: "ACTIVATION", label: "Activation — get them to first value" },
  { value: "RETENTION", label: "Retention — keep the ones we have" },
  { value: "REVENUE", label: "Revenue — grow what each customer is worth" },
];

/** Short labels for dense surfaces: cards, badges, the project switcher. */
export const BUSINESS_STAGE_SHORT: Record<BusinessStage, string> = {
  IDEA: "Idea",
  PRE_LAUNCH: "Pre-launch",
  EARLY_TRACTION: "Early traction",
  SCALING: "Scaling",
  ESTABLISHED: "Established",
};

export const PRIMARY_GOAL_SHORT: Record<PrimaryGoal, string> = {
  AWARENESS: "Awareness",
  ACQUISITION: "Acquisition",
  ACTIVATION: "Activation",
  RETENTION: "Retention",
  REVENUE: "Revenue",
};

const toLookup = (options: Option[]) =>
  Object.fromEntries(options.map((option) => [option.value, option.label]));

const INDUSTRY_LABELS = toLookup(INDUSTRIES);
const COUNTRY_LABELS = toLookup(COUNTRIES);
const MARKET_LABELS = toLookup(MARKETS);

/** Resolve a stored code to its label, falling back to the code itself. */
export const industryLabel = (value: string) => INDUSTRY_LABELS[value] ?? value;
export const countryLabel = (value: string) => COUNTRY_LABELS[value] ?? value;
export const marketLabel = (value: string) => MARKET_LABELS[value] ?? value;

export const INDUSTRY_VALUES = INDUSTRIES.map((option) => option.value);
export const COUNTRY_VALUES = COUNTRIES.map((option) => option.value);
export const MARKET_VALUES = MARKETS.map((option) => option.value);
