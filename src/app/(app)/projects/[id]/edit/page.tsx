import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { ProjectForm } from "@/components/projects/project-form";
import { updateProjectAction } from "@/lib/projects/actions";
import { getProject } from "@/lib/projects/queries";

/**
 * Resolving the project here rather than only in the component matters:
 * metadata runs before the response begins streaming, so `notFound()` can still
 * set a 404 status. Called from inside the render, after `loading.tsx` has
 * already flushed the shell, it could only swap the body and the response would
 * misreport 200.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) notFound();

  return { title: project.name };
}

/** Next 16 delivers route params asynchronously. */
export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) notFound();

  // Bind the id server-side so the client form never has to carry it.
  const action = updateProjectAction.bind(null, project.id);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        eyebrow="Projects"
        title={project.name}
        description="Update how LUMEN understands this business."
        actions={project.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
      />

      <ProjectForm
        action={action}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        defaultValues={{
          name: project.name,
          website: project.website ?? "",
          industry: project.industry,
          country: project.country,
          targetMarkets: project.targetMarkets,
          description: project.description ?? "",
          businessStage: project.businessStage,
          primaryGoal: project.primaryGoal,
        }}
      />
    </div>
  );
}
