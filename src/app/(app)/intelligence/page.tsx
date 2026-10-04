import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { IntelligenceWorkspace } from "@/components/intelligence/intelligence-workspace";
import { Button } from "@/components/ui/button";
import {
  getIntelligenceReadiness,
  listCompetitors,
  listInsights,
} from "@/lib/intelligence/queries";
import { countProjects, getActiveProject } from "@/lib/projects/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Intelligence",
};

/**
 * SCOUT — market intelligence.
 *
 * Unlike ATLAS and PULSE this is not gated on the business profile, because its
 * input is the competitor records rather than the profile. It is gated on
 * having recorded something substantive about at least one competitor.
 */
export default async function IntelligencePage() {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Intelligence" title="Intelligence" />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="Competitors belong to one business. Select or restore a project first."
          action={
            <Button asChild>
              <Link href="/projects">Manage projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [competitors, insights, readiness] = await Promise.all([
    listCompetitors(project.id),
    listInsights(project.id),
    getIntelligenceReadiness(project.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow={project.name}
        title="Intelligence"
        description="Competitors you have recorded, and what SCOUT can conclude from them."
      />

      <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        SCOUT has no internet access in this build. It never asserts facts about a competitor that
        you have not written down, and every conclusion cites what it rests on.
      </p>

      <IntelligenceWorkspace
        projectId={project.id}
        competitors={competitors}
        insights={insights}
        canAnalyse={readiness.canAnalyse}
      />
    </div>
  );
}
