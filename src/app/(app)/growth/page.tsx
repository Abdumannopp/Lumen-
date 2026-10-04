import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers, Sprout } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { GrowthWorkspace } from "@/components/growth/growth-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProjectContextBuilder } from "@/lib/ai/context-builder";
import { getGrowthComparison } from "@/lib/analytics/queries";
import { buildGrowthSignals } from "@/lib/analytics/signals";
import { GrowthPulse } from "@/components/growth/growth-pulse";
import { ascendAgent, maxConfidence, readEvidence } from "@/lib/growth/agent";
import { listRecommendations } from "@/lib/growth/queries";
import { getBusinessContext } from "@/lib/business-profile/queries";
import { countProjects, getActiveProject } from "@/lib/projects/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Growth",
};

/**
 * ASCEND — growth intelligence.
 *
 * The evidence available is computed and shown *before* generating, so the
 * operator knows what a recommendation can be worth before they read one.
 */
export default async function GrowthPage() {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Growth" title="Growth" />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="Recommendations belong to one business. Select or restore a project first."
          action={
            <Button asChild>
              <Link href="/projects">Manage projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [context, recommendations, agentContext, growthComparison] = await Promise.all([
    getBusinessContext(project.id),
    listRecommendations(project.id),
    new ProjectContextBuilder(project.id).include(...ascendAgent.contextSources).build(),
    getGrowthComparison(project.id),
  ]);

  const profileComplete = context?.completion.isComplete ?? false;
  const comparison = growthComparison;
  const signals = buildGrowthSignals(comparison);
  const hasComparisonData = comparison.recent.rowCount > 0 && comparison.previous.rowCount > 0;
  const evidence = readEvidence(agentContext);
  const ceiling = maxConfidence(evidence);

  const evidenceNote =
    ceiling === "HIGH"
      ? `Recorded performance data is available, so ASCEND can reach high confidence. Reading: ${evidence.sources.join(", ")}.`
      : ceiling === "MEDIUM"
        ? `No performance data is recorded yet, so nothing here can exceed medium confidence. Reading: ${evidence.sources.join(", ")}.`
        : "Only the business profile is recorded, so recommendations rest on a description rather than evidence and are capped at low confidence.";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow={project.name}
        title="Growth"
        description="What to do next, and how much the evidence actually supports it."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!profileComplete && <Badge variant="warning">Profile incomplete</Badge>}
            <Button asChild variant="outline">
              <Link href="/growth/experiments">Experiments</Link>
            </Button>
          </div>
        }
      />

      <GrowthPulse signals={signals} hasComparisonData={hasComparisonData} />

      {!profileComplete && (
        <EmptyState
          icon={<Sprout className="size-5" />}
          title="Finish the business profile first"
          description="ASCEND reasons from everything recorded. With an incomplete profile it would produce advice that fits any company. You can still add your own recommendations."
          action={
            <Button asChild>
              <Link href={`/projects/${project.id}/onboarding`}>Complete the profile</Link>
            </Button>
          }
        />
      )}

      <GrowthWorkspace
        projectId={project.id}
        recommendations={recommendations}
        canGenerate={profileComplete}
        evidenceNote={evidenceNote}
      />
    </div>
  );
}
