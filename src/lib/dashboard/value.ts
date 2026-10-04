import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";

/**
 * A deliberately honest value snapshot: execution, not invented revenue.
 * Lumen can prove what work the operator completed; it cannot claim that Lumen
 * caused a business outcome without a measured experiment.
 */
export async function getExecutionMomentum(projectId: string) {
  await requireProject(projectId);

  const plan = await db.weeklyPlan.findFirst({
    where: { projectId, status: "ACTIVE" },
    orderBy: { version: "desc" },
    select: {
      weekStart: true,
      tasks: { select: { status: true } },
    },
  });

  if (!plan) {
    return { hasPlan: false, total: 0, done: 0, skipped: 0, completionRate: 0, weekStart: null };
  }

  const total = plan.tasks.length;
  const done = plan.tasks.filter((task) => task.status === "DONE").length;
  const skipped = plan.tasks.filter((task) => task.status === "SKIPPED").length;

  return {
    hasPlan: true,
    total,
    done,
    skipped,
    completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
    weekStart: plan.weekStart,
  };
}
