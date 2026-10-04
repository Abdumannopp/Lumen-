import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { BudgetPlanner } from "@/components/budget/budget-planner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PRIMARY_GOAL_SHORT } from "@/config/project";
import { listBudgetPlans } from "@/lib/budget/queries";
import { getBusinessContext } from "@/lib/business-profile/queries";
import { countProjects, getActiveProject } from "@/lib/projects/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Budget",
};

/** Marketing budget planner. Allocation always equals the total. */
export default async function BudgetPage() {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Budget" title="Budget" />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="A budget belongs to one business. Select or restore a project first."
          action={
            <Button asChild>
              <Link href="/projects">Manage projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [context, plans] = await Promise.all([
    getBusinessContext(project.id),
    listBudgetPlans(project.id),
  ]);

  const profileComplete = context?.completion.isComplete ?? false;
  const goal = context ? PRIMARY_GOAL_SHORT[context.business.primaryGoal] : "Acquisition";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow={project.name}
        title="Budget"
        description="Where the money goes, why, and what could go wrong."
        actions={!profileComplete ? <Badge variant="warning">Profile incomplete</Badge> : null}
      />

      <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        LUMEN never promises a return. A suggested allocation explains what each channel is for
        and what the risk of spending there is — the outcome depends on execution and on things
        no planner can see.
      </p>

      <BudgetPlanner
        projectId={project.id}
        plans={plans}
        goal={goal}
        defaultCurrency={context?.business.monthlyBudget?.currency ?? "USD"}
        defaultTotal={context?.business.monthlyBudget?.amount ?? null}
        canSuggest={profileComplete}
      />
    </div>
  );
}
