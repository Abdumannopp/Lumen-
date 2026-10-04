import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers, Users } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { AudienceWorkspace } from "@/components/audience/audience-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listSegments } from "@/lib/audience/queries";
import { getBusinessContext } from "@/lib/business-profile/queries";
import { countProjects, getActiveProject } from "@/lib/projects/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Audience",
};

/**
 * PULSE — audience intelligence.
 *
 * Generation is gated on a complete profile for the same reason as ATLAS: an
 * audience inferred from three facts reads as confidently as one inferred from
 * twenty, and segments are the thing every later module builds on.
 */
export default async function AudiencePage() {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Audience" title="Audience" />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="An audience belongs to one business. Select or restore a project first."
          action={
            <Button asChild>
              <Link href="/projects">Manage projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [context, segments] = await Promise.all([
    getBusinessContext(project.id),
    listSegments(project.id),
  ]);

  const profileComplete = context?.completion.isComplete ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow={project.name}
        title="Audience"
        description="Who buys, why they buy, and what would stop them."
        actions={!profileComplete ? <Badge variant="warning">Profile incomplete</Badge> : null}
      />

      {!profileComplete && (
        <EmptyState
          icon={<Users className="size-5" />}
          title="Finish the business profile first"
          description="PULSE builds segments from what it knows about this business. With an incomplete profile it would describe an audience that fits any company — which is worse than none. You can still add segments by hand."
          action={
            <Button asChild>
              <Link href={`/projects/${project.id}/onboarding`}>Complete the profile</Link>
            </Button>
          }
        />
      )}

      <AudienceWorkspace
        projectId={project.id}
        segments={segments}
        canGenerate={profileComplete}
      />
    </div>
  );
}
