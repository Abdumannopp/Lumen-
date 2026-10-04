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
import { GoogleConnectionCard } from "@/components/integrations/google-connection-card";
import { getGoogleConnection } from "@/lib/integrations/google/queries";
import { googleConfigured } from "@/lib/integrations/google/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics",
};

/**
 * Analytics combines manual measurements with optional read-only Google imports.
 * Imported rows remain distinguishable from operator-entered data, while all
 * derived metrics continue to use the same calculation path.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; google?: string }>;
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

  const { from, to, google } = await searchParams;
  const range = parseRange(from, to);

  const [context, rows, totalRows, googleConnection] = await Promise.all([
    getBusinessContext(project.id),
    listMetrics(project.id, range),
    countAllMetrics(project.id),
    getGoogleConnection(project.id),
  ]);

  const summary = summarise(rows);

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeader
        eyebrow={project.name}
        title="Analytics"
        description="What actually happened, from connected sources and numbers you entered."
      />

      <DateRangeControl from={toDayInput(range.from)} to={toDayInput(range.to)} />

      {google && (
        <div
          role="status"
          className={
            google === "connected"
              ? "rounded-xl border border-success/35 bg-success/8 px-4 py-3 text-sm"
              : "rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm"
          }
        >
          {google === "connected"
            ? "Google connected. Select your properties and sync the first 30 completed days."
            : "Google could not be connected. Check the deployment OAuth settings and try again."}
        </div>
      )}

      <GoogleConnectionCard
        projectId={project.id}
        configured={googleConfigured()}
        connection={googleConnection}
      />

      {totalRows === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-5" />}
          title="No data connected"
          description="Connect Google above or enter what you measured manually — spend, clicks, leads, customers — and Lumen derives the metrics that are valid from the data you have."
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
