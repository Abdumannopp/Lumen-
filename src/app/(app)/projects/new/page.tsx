import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { createProjectAction } from "@/lib/projects/actions";

export const metadata: Metadata = {
  title: "New project",
  description: "Add a business to this LUMEN install.",
};

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        eyebrow="Projects"
        title="New project"
        description="Describe the business. These details shape the guidance LUMEN gives you later."
      />

      <ProjectForm
        action={createProjectAction}
        submitLabel="Create project"
        pendingLabel="Creating…"
      />
    </div>
  );
}
