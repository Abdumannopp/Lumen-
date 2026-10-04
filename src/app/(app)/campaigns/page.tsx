import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers, Megaphone } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { CampaignWorkspace } from "@/components/campaigns/campaign-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listCampaigns } from "@/lib/campaigns/queries";
import { getBusinessContext } from "@/lib/business-profile/queries";
import { countProjects, getActiveProject } from "@/lib/projects/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Campaigns",
};

/** ORBIT — campaign planning. Planning objects only; no ad platform is connected. */
export default async function CampaignsPage() {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Campaigns" title="Campaigns" />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="Campaigns belong to one business. Select or restore a project first."
          action={
            <Button asChild>
              <Link href="/projects">Manage projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [context, campaigns] = await Promise.all([
    getBusinessContext(project.id),
    listCampaigns(project.id),
  ]);

  const profileComplete = context?.completion.isComplete ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow={project.name}
        title="Campaigns"
        description="Objective, offer, channels, budget and what to measure."
        actions={!profileComplete ? <Badge variant="warning">Profile incomplete</Badge> : null}
      />

      <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Campaigns in LUMEN are plans. No ad platform is connected, nothing is launched from here,
        and no spend is made. &ldquo;Active&rdquo; records that you are running it yourself.
      </p>

      {!profileComplete && (
        <EmptyState
          icon={<Megaphone className="size-5" />}
          title="Finish the business profile first"
          description="ORBIT plans from what it knows about this business, its audience and its offer. You can still add campaigns by hand."
          action={
            <Button asChild>
              <Link href={`/projects/${project.id}/onboarding`}>Complete the profile</Link>
            </Button>
          }
        />
      )}

      <CampaignWorkspace
        projectId={project.id}
        campaigns={campaigns}
        canPlan={profileComplete}
        defaultCurrency={context?.business.monthlyBudget?.currency ?? "USD"}
      />
    </div>
  );
}
