import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ContentCalendar } from "@/components/content/content-calendar";
import { PlanGenerator } from "@/components/content/plan-generator";
import { Button } from "@/components/ui/button";
import { listContentItems } from "@/lib/content/queries";
import { getBusinessContext } from "@/lib/business-profile/queries";
import { countProjects, getActiveProject } from "@/lib/projects/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Content calendar",
};

export default async function ContentCalendarPage() {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Content" title="Calendar" />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="A calendar belongs to one business. Select or restore a project first."
          action={
            <Button asChild>
              <Link href="/projects">Manage projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [context, items] = await Promise.all([
    getBusinessContext(project.id),
    listContentItems(project.id),
  ]);

  const profileComplete = context?.completion.isComplete ?? false;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow={project.name}
        title="Content calendar"
        description="What goes out, and when. LUMEN does not publish — this is your plan."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/content">All content</Link>
            </Button>
            {profileComplete && <PlanGenerator projectId={project.id} />}
          </div>
        }
      />

      <ContentCalendar projectId={project.id} items={items} />
    </div>
  );
}
