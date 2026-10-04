import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PlanWorkspace } from "@/components/plan/plan-workspace";
import { Button } from "@/components/ui/button";
import { getBusinessContext } from "@/lib/business-profile/queries";
import { countProjects, getActiveProject } from "@/lib/projects/queries";
import { getActivePlan } from "@/lib/weekly-plan/queries";
import { getAllowanceForCurrentWorkspace } from "@/lib/usage/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "This week",
};

/**
 * The weekly plan.
 *
 * Everything else in LUMEN describes a business. This page tells its operator
 * what to do, which is the only part of the product that has to survive contact
 * with a Monday morning.
 */
export default async function PlanPage() {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Plan" title="This week" />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="A plan belongs to one business. Select or restore a project first."
          action={
            <Button asChild>
              <Link href="/projects">Manage projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const [context, plan, allowance] = await Promise.all([
    getBusinessContext(project.id),
    getActivePlan(project.id),
    getAllowanceForCurrentWorkspace(),
  ]);

  // A plan is only as good as what it was told. Rather than generating from a
  // half-filled profile and quietly producing generic advice, the button is
  // unavailable and says why.
  const profileComplete = Boolean(context?.profile?.completedAt);

  // Two different reasons the button may be unavailable, and they are told
  // apart on purpose: one is fixed by answering questions, the other by waiting
  // or paying. Collapsing them into "you cannot do this" would leave the person
  // guessing which.
  const blockedReason = !profileComplete
    ? "Finish the business profile first. A plan built on half an answer is a plan for a business that does not exist."
    : allowance.exhausted
      ? `This workspace has used all ${allowance.limit} of its AI actions this month. The allowance renews on ${allowance.periodEnd.toISOString().slice(0, 10)}.`
      : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Plan"
        title="This week"
        description="A short list of marketing work you can finish this week. Mark what you did and what you skipped — next week's plan reads both."
      />

      <PlanWorkspace
        projectId={project.id}
        plan={plan}
        canGenerate={profileComplete && !allowance.exhausted}
        blockedReason={blockedReason}
        allowance={{ remaining: allowance.remaining, limit: allowance.limit }}
      />
    </div>
  );
}
