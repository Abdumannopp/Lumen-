import { z } from "zod";

/**
 * Derived marketing metrics.
 *
 * One rule governs this whole file: **a ratio with no denominator is `null`,
 * never zero**. A CTR of 0% means "nobody clicked"; a CTR of null means "we
 * cannot know". Collapsing the second into the first is the single most
 * misleading thing an analytics module can do, because it invents a data point
 * that says the campaign failed when in fact nothing was measured.
 *
 * Everything here is pure and derived on read. No computed metric is ever
 * stored, so a ratio can never disagree with the numbers underneath it.
 */

export interface MetricTotals {
  spend: number | null;
  revenue: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  leads: number | null;
  conversions: number | null;
  customers: number | null;
}

export interface DerivedMetrics {
  /** Clicks ÷ impressions, as a percentage. */
  ctr: number | null;
  /** Spend ÷ clicks. */
  cpc: number | null;
  /** Spend ÷ leads. */
  cpl: number | null;
  /** Conversions ÷ clicks, as a percentage. */
  conversionRate: number | null;
  /** Spend ÷ customers. */
  cac: number | null;
  /** Revenue ÷ spend, as a multiple. */
  roas: number | null;
}

/**
 * Divide, or return null.
 *
 * Guards the three ways this goes wrong: a missing numerator, a missing
 * denominator, and a zero denominator. A zero denominator is not an error in
 * the data — it means the thing being divided by never happened — so it yields
 * "unknown" rather than throwing or producing Infinity.
 */
export function safeDivide(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (numerator === null || numerator === undefined) return null;
  if (denominator === null || denominator === undefined) return null;
  if (denominator === 0) return null;

  const result = numerator / denominator;
  return Number.isFinite(result) ? result : null;
}

const round = (value: number | null, places: number): number | null =>
  value === null ? null : Math.round(value * 10 ** places) / 10 ** places;

export function derive(totals: MetricTotals): DerivedMetrics {
  const ctr = safeDivide(totals.clicks, totals.impressions);
  const conversionRate = safeDivide(totals.conversions, totals.clicks);

  return {
    ctr: ctr === null ? null : round(ctr * 100, 2),
    cpc: round(safeDivide(totals.spend, totals.clicks), 2),
    cpl: round(safeDivide(totals.spend, totals.leads), 2),
    conversionRate: conversionRate === null ? null : round(conversionRate * 100, 2),
    cac: round(safeDivide(totals.spend, totals.customers), 2),
    roas: round(safeDivide(totals.revenue, totals.spend), 2),
  };
}

/**
 * Sum a set of rows.
 *
 * A column stays null if no row supplied a value for it, rather than becoming
 * zero. "We never recorded revenue" and "we recorded revenue of zero" are
 * different facts, and only the second should read as a result.
 */
export function sumRows(
  rows: Partial<Record<keyof MetricTotals, number | null>>[],
): MetricTotals {
  const keys: (keyof MetricTotals)[] = [
    "spend",
    "revenue",
    "impressions",
    "reach",
    "clicks",
    "leads",
    "conversions",
    "customers",
  ];

  const totals = {} as MetricTotals;

  for (const key of keys) {
    const present = rows
      .map((row) => row[key])
      .filter((value): value is number => typeof value === "number");

    totals[key] = present.length > 0 ? present.reduce((sum, value) => sum + value, 0) : null;
  }

  return totals;
}

export const FUNNEL_STAGES = [
  { key: "impressions", label: "Impressions" },
  { key: "reach", label: "Reach" },
  { key: "clicks", label: "Clicks" },
  { key: "leads", label: "Leads" },
  { key: "conversions", label: "Conversions" },
  { key: "customers", label: "Customers" },
] as const;

export interface FunnelStage {
  key: string;
  label: string;
  value: number | null;
  /** Share of the previous recorded stage, as a percentage. */
  stepRate: number | null;
}

/**
 * Build the funnel, skipping stages nobody recorded.
 *
 * Step rates compare against the previous *recorded* stage, not the previous
 * stage in the list — otherwise leaving `reach` blank would silently make the
 * click-through rate meaningless.
 */
export function buildFunnel(totals: MetricTotals): FunnelStage[] {
  let previous: number | null = null;

  return FUNNEL_STAGES.map((stage) => {
    const value = totals[stage.key as keyof MetricTotals];
    const rate = value === null ? null : safeDivide(value, previous);

    if (value !== null) previous = value;

    return {
      key: stage.key,
      label: stage.label,
      value,
      stepRate: rate === null ? null : Math.round(rate * 1000) / 10,
    };
  });
}

/** Channels the entry form offers. Free text is allowed alongside these. */
export const METRIC_CHANNELS = [
  "Meta Ads",
  "Google Ads",
  "TikTok Ads",
  "LinkedIn Ads",
  "SEO",
  "Content",
  "Email",
  "Influencers",
  "Referral",
  "Outbound",
  "Events",
  "Organic social",
  "Other",
] as const;

const optionalCount = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.round(parsed));
  });

export const metricSchema = z.object({
  date: z
    .string()
    .trim()
    .min(1, "Enter the date these numbers cover.")
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Enter a valid date." }),
  channel: z.string().trim().min(1, "Say which channel this is.").max(80),
  campaign: z.string().trim().max(120).optional().transform((value) => value || null),
  currency: z.string().trim().max(8).optional().transform((value) => value || null),
  spend: optionalCount,
  revenue: optionalCount,
  impressions: optionalCount,
  reach: optionalCount,
  clicks: optionalCount,
  leads: optionalCount,
  conversions: optionalCount,
  customers: optionalCount,
  note: z.string().trim().max(500).optional().transform((value) => value || null),
});

export type MetricInput = z.input<typeof metricSchema>;

/** Formatting helpers. `null` always renders as "not enough data", never 0. */
export const NOT_ENOUGH_DATA = "—";

export function formatNumber(value: number | null): string {
  return value === null ? NOT_ENOUGH_DATA : value.toLocaleString("en-US");
}

export function formatMoney(value: number | null, currency: string | null): string {
  if (value === null) return NOT_ENOUGH_DATA;
  return `${value.toLocaleString("en-US")}${currency ? ` ${currency}` : ""}`;
}

export function formatPercent(value: number | null): string {
  return value === null ? NOT_ENOUGH_DATA : `${value}%`;
}

export function formatRatio(value: number | null): string {
  return value === null ? NOT_ENOUGH_DATA : `${value}×`;
}
