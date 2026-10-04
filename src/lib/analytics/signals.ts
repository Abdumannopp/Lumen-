import type { AnalyticsSummary, Breakdown } from "@/lib/analytics/queries";

export type GrowthSignalDirection = "UP" | "DOWN";
export type GrowthSignalSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";

export interface GrowthSignal {
  key: string;
  title: string;
  summary: string;
  action: string;
  metric: string;
  current: number;
  previous: number;
  changePercent: number;
  direction: GrowthSignalDirection;
  severity: GrowthSignalSeverity;
  basedOn: string;
}

export interface GrowthComparison {
  recent: AnalyticsSummary;
  previous: AnalyticsSummary;
  recentDays: number;
  previousDays: number;
}

function changePercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function severityFor(absChange: number): GrowthSignalSeverity {
  if (absChange >= 40) return "CRITICAL";
  if (absChange >= 25) return "HIGH";
  if (absChange >= 15) return "MEDIUM";
  return "INFO";
}

function formatPercent(value: number) {
  const rounded = Math.round(Math.abs(value) * 10) / 10;
  return `${rounded}%`;
}

function makeSignal(input: {
  key: string;
  title: string;
  metric: string;
  current: number | null;
  previous: number | null;
  summaryUp: string;
  summaryDown: string;
  actionUp: string;
  actionDown: string;
  basedOn: string;
  threshold?: number;
}): GrowthSignal | null {
  const change =
    input.current === null || input.previous === null
      ? null
      : changePercent(input.current, input.previous);

  if (change === null) return null;
  const threshold = input.threshold ?? 15;
  if (Math.abs(change) < threshold) return null;

  const direction: GrowthSignalDirection = change > 0 ? "UP" : "DOWN";

  return {
    key: input.key,
    title: input.title,
    metric: input.metric,
    current: input.current,
    previous: input.previous,
    changePercent: Math.round(change * 10) / 10,
    direction,
    severity: severityFor(Math.abs(change)),
    summary: `${direction === "UP" ? input.summaryUp : input.summaryDown} (${formatPercent(change)} vs the previous period).`,
    action: direction === "UP" ? input.actionUp : input.actionDown,
    basedOn: input.basedOn,
  };
}

function totalValue(summary: AnalyticsSummary, key: keyof AnalyticsSummary["totals"]) {
  return summary.totals[key];
}

function channelComparison(
  recent: AnalyticsSummary,
  previous: AnalyticsSummary,
): GrowthSignal | null {
  const recentMap = new Map(recent.byChannel.map((entry) => [entry.label, entry]));
  const previousMap = new Map(previous.byChannel.map((entry) => [entry.label, entry]));

  const candidates: Array<{ entry: Breakdown; previous: Breakdown; value: number; previousValue: number }> = [];

  for (const [label, entry] of recentMap) {
    const previousEntry = previousMap.get(label);
    if (!previousEntry) continue;

    const recentValue = entry.totals.leads ?? entry.totals.customers ?? entry.totals.clicks;
    const previousValue = previousEntry.totals.leads ?? previousEntry.totals.customers ?? previousEntry.totals.clicks;
    if (recentValue === null || previousValue === null || previousValue === 0) continue;
    const change = changePercent(recentValue, previousValue);
    if (change === null || Math.abs(change) < 25) continue;
    candidates.push({ entry, previous: previousEntry, value: recentValue, previousValue });
  }

  candidates.sort((a, b) => Math.abs(changePercent(b.value, b.previousValue) ?? 0) - Math.abs(changePercent(a.value, a.previousValue) ?? 0));
  const winner = candidates[0];
  if (!winner) return null;

  const change = changePercent(winner.value, winner.previousValue);
  if (change === null) return null;

  const direction: GrowthSignalDirection = change > 0 ? "UP" : "DOWN";
  const metric = winner.entry.totals.leads !== null ? "leads" : winner.entry.totals.customers !== null ? "customers" : "clicks";

  return {
    key: `channel:${winner.entry.label}`,
    title: `${winner.entry.label} changed materially`,
    metric,
    current: winner.value,
    previous: winner.previousValue,
    changePercent: Math.round(change * 10) / 10,
    direction,
    severity: severityFor(Math.abs(change)),
    summary: `${winner.entry.label} ${metric} ${direction === "UP" ? "increased" : "decreased"} by ${formatPercent(change)} vs the previous period.`,
    action:
      direction === "UP"
        ? `Keep the core ${winner.entry.label} motion and test one small variation to learn what is driving the lift.`
        : `Review the ${winner.entry.label} campaign or message that changed most recently before adding more spend or work.` ,
    basedOn: `${winner.entry.label} channel performance over two ${"14-day"} periods`,
  };
}

/**
 * Deterministic growth signals from recorded performance.
 * No benchmarks or external assumptions are used; every signal is a comparison
 * inside the project's own history.
 */
export function buildGrowthSignals(comparison: GrowthComparison): GrowthSignal[] {
  const { recent, previous } = comparison;
  const signals: GrowthSignal[] = [];

  const candidates = [
    makeSignal({
      key: "revenue",
      title: "Revenue movement",
      metric: "revenue",
      current: totalValue(recent, "revenue"),
      previous: totalValue(previous, "revenue"),
      summaryUp: "Recorded revenue is moving up",
      summaryDown: "Recorded revenue is moving down",
      actionUp: "Identify which campaign, channel, or offer contributed to the lift and carry that learning into this week's plan.",
      actionDown: "Find the largest recent drop in channel, campaign, or conversion performance before increasing acquisition spend.",
      basedOn: "Recorded revenue over two 14-day periods",
      threshold: 15,
    }),
    makeSignal({
      key: "roas",
      title: "Return on spend",
      metric: "ROAS",
      current: recent.derived.roas,
      previous: previous.derived.roas,
      summaryUp: "Recorded ROAS is improving",
      summaryDown: "Recorded ROAS is weakening",
      actionUp: "Protect the strongest spending pattern and test a small budget reallocation rather than scaling everything at once.",
      actionDown: "Pause expansion and inspect the weakest campaign or conversion step before adding spend.",
      basedOn: "Recorded revenue and spend over two 14-day periods",
      threshold: 15,
    }),
    makeSignal({
      key: "customers",
      title: "Customer movement",
      metric: "customers",
      current: totalValue(recent, "customers"),
      previous: totalValue(previous, "customers"),
      summaryUp: "Recorded customers are increasing",
      summaryDown: "Recorded customers are decreasing",
      actionUp: "Trace new customers back to the channel or offer that produced them and repeat the useful pattern.",
      actionDown: "Review the path from click to customer and identify the first step where performance deteriorated.",
      basedOn: "Recorded customers over two 14-day periods",
      threshold: 15,
    }),
    makeSignal({
      key: "conversion-rate",
      title: "Conversion efficiency",
      metric: "conversion rate",
      current: recent.derived.conversionRate,
      previous: previous.derived.conversionRate,
      summaryUp: "Recorded click-to-conversion efficiency is improving",
      summaryDown: "Recorded click-to-conversion efficiency is weakening",
      actionUp: "Document what changed in the offer or landing experience and test whether the improvement holds.",
      actionDown: "Inspect the landing page, offer, or follow-up flow before trying to buy more traffic.",
      basedOn: "Recorded conversions and clicks over two 14-day periods",
      threshold: 15,
    }),
    makeSignal({
      key: "leads",
      title: "Lead volume",
      metric: "leads",
      current: totalValue(recent, "leads"),
      previous: totalValue(previous, "leads"),
      summaryUp: "Recorded lead volume is increasing",
      summaryDown: "Recorded lead volume is decreasing",
      actionUp: "Compare the recent lead source and message with the previous period and reuse the strongest pattern.",
      actionDown: "Check whether the decline comes from less traffic or a weaker conversion step before changing the entire strategy.",
      basedOn: "Recorded leads over two 14-day periods",
      threshold: 20,
    }),
    makeSignal({
      key: "clicks",
      title: "Traffic movement",
      metric: "clicks",
      current: totalValue(recent, "clicks"),
      previous: totalValue(previous, "clicks"),
      summaryUp: "Recorded clicks are increasing",
      summaryDown: "Recorded clicks are decreasing",
      actionUp: "Identify which channel or message drove the extra clicks and test whether the downstream funnel also improved.",
      actionDown: "Check distribution, search visibility, and campaign delivery for the channels losing traffic.",
      basedOn: "Recorded clicks over two 14-day periods",
      threshold: 20,
    }),
  ];

  for (const candidate of candidates) {
    if (candidate) signals.push(candidate);
  }

  const channelSignal = channelComparison(recent, previous);
  if (channelSignal) signals.push(channelSignal);

  const severityRank: Record<GrowthSignalSeverity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    INFO: 3,
  };

  return signals
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 5);
}
