import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import type { RecordSource } from "@/generated/prisma/enums";
import { endOfDay, parseDayInput, startOfDay, toDayInput, todayInput } from "@/lib/date";
import { buildFunnel, derive, sumRows, type MetricTotals } from "@/lib/analytics/metrics";

/**
 * Analytics reads.
 *
 * Aggregation happens here and derivation happens on top of it, so every view —
 * overview, channel, campaign, time series — divides the same way and cannot
 * disagree with another.
 */

export interface MetricRow {
  id: string;
  date: Date;
  channel: string;
  campaign: string | null;
  currency: string | null;
  spend: number | null;
  revenue: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  leads: number | null;
  conversions: number | null;
  customers: number | null;
  note: string | null;
  source: RecordSource;
  externalKey?: string | null;
}

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Default window: the last 30 days, inclusive of today.
 *
 * Every function here begins with `requireProject`. The projectId reaching it
 * came from a page, and a page's parameters come from a URL — so "is this the
 * caller's project" is a question the query has to ask, not one it may assume
 * was asked upstream.
 */
export function defaultRange(): DateRange {
  // Anchored on the operator's local today, then expressed as stored UTC days:
  // "the last 30 days" means their calendar, but rows are keyed to UTC midnight.
  const today = parseDayInput(todayInput());
  const to = endOfDay(today ?? new Date());

  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);

  return { from: startOfDay(from), to };
}


export interface GrowthComparisonWindow {
  from: Date;
  to: Date;
  recentFrom: Date;
  recentTo: Date;
  previousFrom: Date;
  previousTo: Date;
}

/** Two comparable 14-day windows, ending today. */
export function growthComparisonWindow(): GrowthComparisonWindow {
  const anchor = parseDayInput(todayInput()) ?? new Date();
  const recentTo = endOfDay(anchor);
  const recentFrom = startOfDay(new Date(anchor.getTime() - 13 * 24 * 60 * 60 * 1000));
  const previousTo = endOfDay(new Date(anchor.getTime() - 14 * 24 * 60 * 60 * 1000));
  const previousFrom = startOfDay(new Date(anchor.getTime() - 27 * 24 * 60 * 60 * 1000));

  return {
    from: previousFrom,
    to: recentTo,
    recentFrom,
    recentTo,
    previousFrom,
    previousTo,
  };
}

/**
 * Read two equal periods so the growth engine can explain what changed rather
 * than only showing a 30-day total.
 */
export async function getGrowthComparison(projectId: string) {
  await requireProject(projectId);

  const window = growthComparisonWindow();
  const rows = await db.marketingMetric.findMany({
    where: { projectId, date: { gte: window.from, lte: window.to } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  const recentRows = rows.filter((row) => row.date >= window.recentFrom && row.date <= window.recentTo);
  const previousRows = rows.filter((row) => row.date >= window.previousFrom && row.date <= window.previousTo);

  return {
    recent: summarise(recentRows),
    previous: summarise(previousRows),
    recentDays: 14,
    previousDays: 14,
  };
}

export function parseRange(fromParam?: string, toParam?: string): DateRange {
  const fallback = defaultRange();

  // Parsed as stored UTC days, matching how rows are written, so the boundaries
  // are the same days the operator picked rather than their local instants.
  const parsedFrom = parseDayInput(fromParam);
  const parsedTo = parseDayInput(toParam);

  const from = parsedFrom ? startOfDay(parsedFrom) : fallback.from;
  const to = parsedTo ? endOfDay(parsedTo) : fallback.to;

  // A reversed range is a typo, not an intent — swap rather than return nothing.
  return from <= to ? { from, to } : { from: startOfDay(to), to: endOfDay(from) };
}

export async function listMetrics(projectId: string, range: DateRange): Promise<MetricRow[]> {
  await requireProject(projectId);

  return db.marketingMetric.findMany({
    where: { projectId, date: { gte: range.from, lte: range.to } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
}

/** All rows, ignoring the range — used to tell "no data at all" from "none here". */
export async function countAllMetrics(projectId: string) {
  await requireProject(projectId);

  return db.marketingMetric.count({ where: { projectId } });
}

function group(rows: MetricRow[], key: (row: MetricRow) => string) {
  const buckets = new Map<string, MetricRow[]>();

  for (const row of rows) {
    const bucket = key(row);
    const existing = buckets.get(bucket);
    if (existing) existing.push(row);
    else buckets.set(bucket, [row]);
  }

  return buckets;
}

export interface Breakdown {
  label: string;
  totals: MetricTotals;
  derived: ReturnType<typeof derive>;
  rowCount: number;
}

function toBreakdown(label: string, rows: MetricRow[]): Breakdown {
  const totals = sumRows(rows);
  return { label, totals, derived: derive(totals), rowCount: rows.length };
}

/**
 * Day bucket key.
 *
 * UTC fields, matching how the column is written. Bucketing by local fields
 * filed a row under the previous day west of UTC, so a chart could show a
 * campaign's results on the day before they happened.
 */
const isoDay = (date: Date) => toDayInput(date);

export interface AnalyticsSummary {
  totals: MetricTotals;
  derived: ReturnType<typeof derive>;
  funnel: ReturnType<typeof buildFunnel>;
  byChannel: Breakdown[];
  byCampaign: Breakdown[];
  overTime: { day: string; totals: MetricTotals }[];
  rowCount: number;
  /** The currency the rows agree on, or null when they disagree or none is set. */
  currency: string | null;
  /** True when rows carry more than one currency — sums would be meaningless. */
  mixedCurrency: boolean;
}

export function summarise(rows: MetricRow[]): AnalyticsSummary {
  const totals = sumRows(rows);

  const currencies = [...new Set(rows.map((row) => row.currency).filter(Boolean))] as string[];
  const mixedCurrency = currencies.length > 1;

  const byChannel = [...group(rows, (row) => row.channel).entries()]
    .map(([label, bucket]) => toBreakdown(label, bucket))
    .sort((a, b) => (b.totals.spend ?? 0) - (a.totals.spend ?? 0));

  const byCampaign = [...group(rows, (row) => row.campaign ?? "No campaign").entries()]
    .map(([label, bucket]) => toBreakdown(label, bucket))
    .sort((a, b) => (b.totals.spend ?? 0) - (a.totals.spend ?? 0));

  const overTime = [...group(rows, (row) => isoDay(row.date)).entries()]
    .map(([day, bucket]) => ({ day, totals: sumRows(bucket) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    totals,
    // Money totals are withheld when currencies are mixed, because adding
    // dollars to euros produces a number that looks real and means nothing.
    derived: derive(mixedCurrency ? { ...totals, spend: null, revenue: null } : totals),
    funnel: buildFunnel(totals),
    byChannel,
    byCampaign,
    overTime,
    rowCount: rows.length,
    currency: currencies.length === 1 ? currencies[0] : null,
    mixedCurrency,
  };
}
