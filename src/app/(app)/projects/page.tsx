import type { Metadata } from "next";
import Link from "next/link";
import { FolderPlus, Layers } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectCard } from "@/components/projects/project-card";
import { Button } from "@/components/ui/button";
import { getActiveProject, listProjects } from "@/lib/projects/queries";
import { db } from "@/lib/db";
import { computeCompletion, toBusinessProfileRecord } from "@/lib/business-profile/queries";

export const metadata: Metadata = {
  title: "Projects",
  description: "Manage the businesses in this LUMEN install.",
};

/**
 * Project list.
 *
 * Archived projects are listed below the active ones rather than hidden behind
 * a filter: on a local install the total count is small, and burying them makes
 * restoring feel like a recovery operation instead of a normal action.
 */
export default async function ProjectsPage() {
  const [projects, activeProject] = await Promise.all([
    listProjects({ includeArchived: true }),
    getActiveProject(),
  ]);

  // One query for every profile rather than one per card.
  const profiles = await db.businessProfile.findMany({
    where: { projectId: { in: projects.map((project) => project.id) } },
  });
  const profileByProject = new Map(
    profiles.map((profile) => [profile.projectId, toBusinessProfileRecord(profile)]),
  );

  const active = projects.filter((project) => project.archivedAt === null);
  const archived = projects.filter((project) => project.archivedAt !== null);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Each project is a separate business. Everything LUMEN records belongs to one of them."
        actions={
          projects.length > 0 ? (
            <Button asChild>
              <Link href="/projects/new">
                <FolderPlus />
                New project
              </Link>
            </Button>
          ) : null
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No projects yet"
          description="Add the first business you want to track. You can manage as many as you like on this machine."
          action={
            <Button asChild>
              <Link href="/projects/new">
                <FolderPlus />
                Create your first project
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-10">
          <section className="space-y-4">
            {active.length === 0 ? (
              <EmptyState
                icon={<Layers className="size-5" />}
                title="Everything is archived"
                description="Restore a project below, or create a new one to start working again."
                action={
                  <Button asChild variant="outline">
                    <Link href="/projects/new">
                      <FolderPlus />
                      New project
                    </Link>
                  </Button>
                }
              />
            ) : (
              active.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isActive={project.id === activeProject?.id}
                  profileComplete={
                    computeCompletion(project, profileByProject.get(project.id) ?? null).isComplete
                  }
                />
              ))
            )}
          </section>

          {archived.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
                Archived · {archived.length}
              </h2>
              {archived.map((project) => (
                <ProjectCard key={project.id} project={project} isActive={false} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
