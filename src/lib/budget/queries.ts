import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import type { RecordSource } from "@/generated/prisma/enums";
import { PRIORITIES, type BudgetLine, type Priority } from "@/lib/budget/agent";

/**
 * Budget reads.
 *
 * Every function here begins with `requireProject`. The projectId reaching it
 * came from a page, and a page's parameters come from a URL — so "is this the
 * caller's project" is a question the query has to ask, not one it may assume
 * was asked upstream.
 */

function toLines(value: unknown): BudgetLine[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.category !== "string" || typeof row.amount !== "number") return [];

    const priority =
      typeof row.priority === "string" && (PRIORITIES as readonly string[]).includes(row.priority)
        ? (row.priority as Priority)
        : null;

    return [
      {
        category: row.category,
        amount: row.amount,
        percent: typeof row.percent === "number" ? row.percent : 0,
        why: typeof row.why === "string" ? row.why : "",
        role: typeof row.role === "string" ? row.role : "",
        risk: typeof row.risk === "string" ? row.risk : "",
        priority,
      },
    ];
  });
}

export interface BudgetPlanRecord {
  id: string;
  name: string;
  total: number;
  currency: string;
  period: string | null;
  goal: string | null;
  lines: BudgetLine[];
  source: RecordSource;
  createdAt: Date;
}

export async function listBudgetPlans(projectId: string): Promise<BudgetPlanRecord[]> {
  await requireProject(projectId);

  const rows = await db.budgetPlan.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    total: row.total,
    currency: row.currency,
    period: row.period,
    goal: row.goal,
    lines: toLines(row.lines),
    source: row.source,
    createdAt: row.createdAt,
  }));
}

export async function getBudgetPlan(projectId: string, planId: string) {
  await requireProject(projectId);

  const plans = await listBudgetPlans(projectId);
  return plans.find((plan) => plan.id === planId) ?? null;
}
