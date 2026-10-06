import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Layers } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import {
  AnalyticsOverview,
  BreakdownTable,
  FunnelSummary,
  PerformanceOverTime,
} from "@/components/analytics/metric-views";
import { MetricEntry } from "@/components/analytics/metric-entry";
import { DashboardSection } from "@/components/dashboard/dashboard-section";
import { Button } from "@/components/ui/button";
import {
  countAllMetrics,
  listMetrics,
  parseRange,
  summarise,
} from "@/lib/analytics/queries";
import { getBusinessContext } from "@/lib/business-profile/queries";
import { toDayInput } from "@/lib/date";
import { countProjects, getActiveProject } from "@/lib/projects/queries";
import { DateRangeControl } from "./date-range";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics",
};

/**
 * Analytics works from the numbers the operator enters. Every derived metric
 * is computed from those rows through one calculation path.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Analytics" title="Analytics" />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="Performance data belongs to one business. Select or restore a project first."
          action={
            <Button asChild>
              <Link href="/projects">Manage projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { from, to } = await searchParams;
  const range = parseRange(from, to);

  const [context, rows, totalRows] = await Promise.all([
    getBusinessContext(project.id),
    listMetrics(project.id, range),
    countAllMetrics(project.id),
  ]);

  const summary = summarise(rows);

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeader
        eyebrow={project.name}
        title="Analytics"
        description="What actually happened, from the numbers you entered."
      />

      <DateRangeControl from={toDayInput(range.from)} to={toDayInput(range.to)} />

      {totalRows === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title="No data recorded yet"
          description="Enter what you measured — spend, clicks, leads, customers — and Lumen derives the metrics that are valid from the data you have."
        />
      ) : summary.rowCount === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          You have {totalRows} {totalRows === 1 ? "row" : "rows"} recorded, but none in this date
          range.
        </p>
      ) : (
        <>
          <DashboardSection title="Overview" description="Totals for the selected range.">
            <AnalyticsOverview summary={summary} />
          </DashboardSection>

          <DashboardSection title="Performance over time">
            <PerformanceOverTime summary={summary} />
          </DashboardSection>

          <DashboardSection title="Channels">
            <BreakdownTable
              title="Channel performance"
              rows={summary.byChannel}
              currency={summary.mixedCurrency ? null : summary.currency}
              emptyLabel="No channel data in this range."
            />
          </DashboardSection>

          <DashboardSection title="Campaigns">
            <BreakdownTable
              title="Campaign performance"
              rows={summary.byCampaign}
              currency={summary.mixedCurrency ? null : summary.currency}
              emptyLabel="No campaign data in this range."
            />
          </DashboardSection>

          <DashboardSection title="Funnel">
            <FunnelSummary summary={summary} />
          </DashboardSection>
        </>
      )}

      <DashboardSection title="Data">
        <MetricEntry
          projectId={project.id}
          rows={rows}
          defaultCurrency={context?.business.monthlyBudget?.currency ?? "USD"}
        />
      </DashboardSection>
    </div>
  );
}
