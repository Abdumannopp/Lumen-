import type { AnalyticsSummary, Breakdown } from "@/lib/analytics/queries";
import {
  NOT_ENOUGH_DATA,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRatio,
} from "@/lib/analytics/metrics";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Analytics views.
 *
 * Server components — none of this needs interactivity, and the whole summary is
 * already computed on the server.
 *
 * Every value that could not be derived renders as an em dash, never as zero.
 * A dash says "we cannot know"; a zero says "it failed", and only one of those
 * is true when a denominator is missing.
 */

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const empty = value === NOT_ENOUGH_DATA;

  return (
    <div className="space-y-1">
      <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "font-display text-lg font-semibold tabular-nums",
          empty ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[0.6875rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AnalyticsOverview({ summary }: { summary: AnalyticsSummary }) {
  const { totals, derived, currency, mixedCurrency } = summary;

  return (
    <div className="space-y-3">
      {mixedCurrency && (
        <p className="rounded-xl border border-warning/35 bg-warning/8 px-4 py-2.5 text-xs leading-relaxed text-foreground">
          These rows use more than one currency, so spend, revenue and anything derived from them
          are not totalled. Filter to one currency to see money figures.
        </p>
      )}

      <Card>
        <CardContent className="grid gap-6 p-6 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Spend" value={formatMoney(mixedCurrency ? null : totals.spend, currency)} />
          <Stat label="Revenue" value={formatMoney(mixedCurrency ? null : totals.revenue, currency)} />
          <Stat label="ROAS" value={formatRatio(derived.roas)} hint="Revenue ÷ spend" />
          <Stat label="CAC" value={formatMoney(derived.cac, currency)} hint="Spend ÷ customers" />

          <Stat label="Impressions" value={formatNumber(totals.impressions)} />
          <Stat label="Clicks" value={formatNumber(totals.clicks)} />
          <Stat label="CTR" value={formatPercent(derived.ctr)} hint="Clicks ÷ impressions" />
          <Stat label="CPC" value={formatMoney(derived.cpc, currency)} hint="Spend ÷ clicks" />

          <Stat label="Leads" value={formatNumber(totals.leads)} />
          <Stat label="CPL" value={formatMoney(derived.cpl, currency)} hint="Spend ÷ leads" />
          <Stat
            label="Conv. rate"
            value={formatPercent(derived.conversionRate)}
            hint="Conversions ÷ clicks"
          />
          <Stat label="Customers" value={formatNumber(totals.customers)} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Simple SVG sparkline — no chart dependency for one line of data. */
export function PerformanceOverTime({ summary }: { summary: AnalyticsSummary }) {
  const points = summary.overTime;

  if (points.length < 2) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            At least two days of data are needed to show a trend.
          </p>
        </CardContent>
      </Card>
    );
  }

  const series = [
    { key: "spend" as const, label: "Spend", colour: "var(--gradient-via)" },
    { key: "clicks" as const, label: "Clicks", colour: "var(--gradient-to)" },
  ];

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        {series.map((entry) => {
          const values = points.map((point) => point.totals[entry.key]);
          const present = values.filter((value): value is number => value !== null);

          if (present.length < 2) {
            return (
              <div key={entry.key} className="space-y-1">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  {entry.label}
                </p>
                <p className="text-xs text-muted-foreground">Not enough data to plot.</p>
              </div>
            );
          }

          const max = Math.max(...present);
          const height = 40;
          const width = 100;

          // Missing days break the line rather than being drawn as zero.
          const segments: string[] = [];
          let current: string[] = [];

          values.forEach((value, index) => {
            if (value === null) {
              if (current.length > 1) segments.push(current.join(" "));
              current = [];
              return;
            }

            const x = (index / (values.length - 1)) * width;
            const y = height - (max === 0 ? 0 : (value / max) * height);
            current.push(`${x.toFixed(2)},${y.toFixed(2)}`);
          });

          if (current.length > 1) segments.push(current.join(" "));

          return (
            <div key={entry.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  {entry.label}
                </p>
                <p className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                  peak {formatNumber(max)}
                </p>
              </div>
              <svg
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                className="h-16 w-full"
                role="img"
                aria-label={`${entry.label} over time`}
              >
                {segments.map((segment, index) => (
                  <polyline
                    key={index}
                    points={segment}
                    fill="none"
                    stroke={entry.colour}
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                  />
                ))}
              </svg>
            </div>
          );
        })}

        <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
          {points[0].day} → {points[points.length - 1].day} · gaps are days with no data
        </p>
      </CardContent>
    </Card>
  );
}

export function BreakdownTable({
  title,
  rows,
  currency,
  emptyLabel,
}: {
  title: string;
  rows: Breakdown[];
  currency: string | null;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-border">
              {["", "Spend", "Clicks", "CTR", "CPC", "Leads", "CPL", "Customers", "ROAS"].map(
                (heading) => (
                  <th
                    key={heading}
                    className="px-3 py-2.5 font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border last:border-0">
                <th scope="row" className="px-3 py-2.5 font-medium text-foreground">
                  {row.label}
                </th>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {formatMoney(row.totals.spend, currency)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {formatNumber(row.totals.clicks)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {formatPercent(row.derived.ctr)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {formatMoney(row.derived.cpc, currency)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {formatNumber(row.totals.leads)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {formatMoney(row.derived.cpl, currency)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {formatNumber(row.totals.customers)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {formatRatio(row.derived.roas)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function FunnelSummary({ summary }: { summary: AnalyticsSummary }) {
  const recorded = summary.funnel.filter((stage) => stage.value !== null);

  if (recorded.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">
            No funnel stages recorded in this range.
          </p>
        </CardContent>
      </Card>
    );
  }

  const widest = Math.max(...recorded.map((stage) => stage.value ?? 0), 1);

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        {summary.funnel.map((stage) => {
          const missing = stage.value === null;
          const width = missing ? 0 : ((stage.value ?? 0) / widest) * 100;

          return (
            <div key={stage.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={missing ? "text-muted-foreground" : "text-foreground"}>
                  {stage.label}
                </span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatNumber(stage.value)}
                  {stage.stepRate !== null && ` · ${stage.stepRate}% of previous`}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                {!missing && (
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--gradient-via),var(--gradient-to))]"
                    style={{ width: `${Math.max(width, 1)}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}

        <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
          Stages you have not recorded are shown empty rather than as zero, and step rates compare
          against the previous stage that has data.
        </p>
      </CardContent>
    </Card>
  );
}
