import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers, PenLine } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ContentWorkspace } from "@/components/content/content-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listContentItems } from "@/lib/content/queries";
import { getBusinessContext } from "@/lib/business-profile/queries";
import { countProjects, getActiveProject } from "@/lib/projects/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Content",
};

/**
 * MUSE — content and creative.
 *
 * Gated on a complete profile like the other agents. Strategy and audience are
 * not required but make the output materially better, so their absence is
 * surfaced as a note rather than a block.
 */
export default async function ContentPage() {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Content" title="Content" />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="Content belongs to one business. Select or restore a project first."
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
  const hasBrandVoice = (context?.business.brandVoice.length ?? 0) > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow={project.name}
        title="Content"
        description="Ideas, hooks, posts and scripts for this business."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!profileComplete && <Badge variant="warning">Profile incomplete</Badge>}
            <Button asChild variant="outline">
              <Link href="/content/calendar">Calendar</Link>
            </Button>
          </div>
        }
      />

      {!profileComplete && (
        <EmptyState
          icon={<PenLine className="size-5" />}
          title="Finish the business profile first"
          description="MUSE writes from what it knows about this business and its audience. Without that it would produce content that fits any company. You can still add pieces by hand."
          action={
            <Button asChild>
              <Link href={`/projects/${project.id}/onboarding`}>Complete the profile</Link>
            </Button>
          }
        />
      )}

      {profileComplete && !hasBrandVoice && (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          No brand voice is recorded, so MUSE will write plainly rather than invent a personality.{" "}
          <Link
            href={`/projects/${project.id}/onboarding`}
            className="rounded-md text-[color:var(--gradient-from)] underline-offset-4 hover:underline"
          >
            Add one
          </Link>
          .
        </p>
      )}

      <ContentWorkspace projectId={project.id} items={items} canGenerate={profileComplete} />
    </div>
  );
}
