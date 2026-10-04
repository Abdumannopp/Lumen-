import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Compass, HelpCircle, Layers } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { GenerateStrategyButton } from "@/components/strategy/generate-button";
import { SectionEditor } from "@/components/strategy/section-editor";
import { VersionList } from "@/components/strategy/version-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { sectionTitle } from "@/lib/strategy/agent";
import { getStrategy } from "@/lib/strategy/queries";
import { getBusinessContext } from "@/lib/business-profile/queries";
import { countProjects, getActiveProject } from "@/lib/projects/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Strategy",
};

/**
 * ATLAS — marketing strategy.
 *
 * Generation is gated on a complete business profile rather than allowed to
 * proceed on thin context. A strategy written from three known facts would look
 * exactly as authoritative as one written from twenty, which is the failure this
 * product must not have.
 */
export default async function StrategyPage() {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Strategy" title="Strategy" />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="A strategy belongs to one business. Select or restore a project first."
          action={
            <Button asChild>
              <Link href="/projects">Manage projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [context, strategy] = await Promise.all([
    getBusinessContext(project.id),
    getStrategy(project.id),
  ]);

  const profileComplete = context?.completion.isComplete ?? false;
  const current = strategy?.current ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow={project.name}
        title="Strategy"
        description="Positioning, messaging, channels and priorities for this business."
        actions={
          profileComplete ? (
            <GenerateStrategyButton projectId={project.id} hasExisting={Boolean(current)} />
          ) : (
            <Badge variant="warning">Profile incomplete</Badge>
          )
        }
      />

      {!profileComplete && (
        <EmptyState
          icon={<Compass className="size-5" />}
          title="Finish the business profile first"
          description="ATLAS writes from what it knows about this business. With an incomplete profile it would produce advice that fits any company — which is worse than none."
          action={
            <Button asChild>
              <Link href={`/projects/${project.id}/onboarding`}>Complete the profile</Link>
            </Button>
          }
        />
      )}

      {profileComplete && !current && (
        <EmptyState
          icon={<Compass className="size-5" />}
          title="No strategy yet"
          description="ATLAS reads this project's profile and writes fourteen sections — positioning, messaging, channels, priorities. You can edit every one afterwards."
          action={<GenerateStrategyButton projectId={project.id} hasExisting={false} />}
        />
      )}

      {current && (
        <>
          {current.body.assumptions.length > 0 && (
            <Card>
              <CardContent className="space-y-2 p-5">
                <p className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.18em] text-warning uppercase">
                  <AlertTriangle className="size-3" />
                  Assumptions — confirm or correct these
                </p>
                <ul className="space-y-1">
                  {current.body.assumptions.map((assumption) => (
                    <li key={assumption} className="text-xs leading-relaxed text-muted-foreground">
                      {assumption}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {current.body.missingInformation.length > 0 && (
            <Card>
              <CardContent className="space-y-2 p-5">
                <p className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.18em] text-muted-foreground uppercase">
                  <HelpCircle className="size-3" />
                  This would sharpen the strategy
                </p>
                <ul className="space-y-1">
                  {current.body.missingInformation.map((item) => (
                    <li key={item} className="text-xs leading-relaxed text-muted-foreground">
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            {current.body.sections.map((section) => (
              <SectionEditor
                key={section.key}
                projectId={project.id}
                sectionKey={section.key}
                title={sectionTitle(section.key)}
                content={section.content}
                source={section.source}
              />
            ))}
          </div>

          <VersionList
            projectId={project.id}
            currentId={current.id}
            versions={(strategy?.versions ?? []).map((version) => ({
              id: version.id,
              version: version.version,
              note: version.note,
              createdAt: version.createdAt.toISOString(),
            }))}
          />
        </>
      )}
    </div>
  );
}
