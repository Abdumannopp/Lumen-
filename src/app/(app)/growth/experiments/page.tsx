import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ExperimentWorkspace } from "@/components/experiments/experiment-workspace";
import { Button } from "@/components/ui/button";
import { countLearnings, listExperiments } from "@/lib/experiments/queries";
import { countProjects, getActiveProject } from "@/lib/projects/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Experiments",
};

/**
 * Growth experiments.
 *
 * The page states plainly what the feedback loop is and is not: completed
 * learnings are reused as context, and nothing is trained. Leaving that implicit
 * would let the loop imply a capability the product does not have.
 */
export default async function ExperimentsPage() {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Growth" title="Experiments" />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="Experiments belong to one business. Select or restore a project first."
          action={
            <Button asChild>
              <Link href="/projects">Manage projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [experiments, learnings] = await Promise.all([
    listExperiments(project.id),
    countLearnings(project.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow={project.name}
        title="Experiments"
        description="What you tried, what happened, and what it taught you."
        actions={
          <Button asChild variant="ghost">
            <Link href="/growth">Back to growth</Link>
          </Button>
        }
      />

      <div className="rounded-xl border border-dashed border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <p>
          {learnings.withLearning > 0 ? (
            <>
              {learnings.withLearning} recorded{" "}
              {learnings.withLearning === 1 ? "learning is" : "learnings are"} read back into future
              advice for this project.
            </>
          ) : (
            <>Completed experiments with a written learning are read back into future advice.</>
          )}{" "}
          <span className="text-muted-foreground">
            LUMEN does not train on your data — it reuses what you wrote down as context, nothing
            more.
          </span>
        </p>
        {learnings.completed > learnings.withLearning && (
          <p className="mt-1.5 text-warning">
            {learnings.completed - learnings.withLearning} completed{" "}
            {learnings.completed - learnings.withLearning === 1 ? "experiment has" : "experiments have"}{" "}
            no learning recorded, so {learnings.completed - learnings.withLearning === 1 ? "it adds" : "they add"}{" "}
            nothing downstream.
          </p>
        )}
      </div>

      <ExperimentWorkspace projectId={project.id} experiments={experiments} />
    </div>
  );
}
