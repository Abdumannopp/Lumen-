import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import type {
  EvidenceConfidence,
  MarketingTaskStatus,
  TaskPriority,
  WeeklyPlanStatus,
} from "@/generated/prisma/enums";

/**
 * Weekly plan reads.
 *
 * Every function here begins with `requireProject`. The projectId reaching it
 * came from a page, and a page's parameters come from a URL — so "is this the
 * caller's project" is a question the query has to ask, not one it may assume
 * was asked upstream.
 */

export interface EvidenceRecord {
  id: string;
  claim: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  fetchedAt: Date | null;
  confidence: EvidenceConfidence;
}

export interface TaskRecord {
  id: string;
  title: string;
  why: string;
  steps: string[];
  channel: string;
  priority: TaskPriority;
  expectedResult: string;
  position: number;
  status: MarketingTaskStatus;
  completedAt: Date | null;
  completionNote: string | null;
  skippedAt: Date | null;
  skipReason: string | null;
  evidence: EvidenceRecord[];
}

export interface PlanRecord {
  id: string;
  version: number;
  status: WeeklyPlanStatus;
  weekStart: Date;
  inputHash: string;
  model: string;
  promptVersion: string;
  createdAt: Date;
  tasks: TaskRecord[];
}

const TASK_SELECT = {
  id: true,
  title: true,
  why: true,
  steps: true,
  channel: true,
  priority: true,
  expectedResult: true,
  position: true,
  status: true,
  completedAt: true,
  completionNote: true,
  skippedAt: true,
  skipReason: true,
  evidence: {
    select: {
      id: true,
      claim: true,
      sourceUrl: true,
      sourceTitle: true,
      fetchedAt: true,
      confidence: true,
    },
    orderBy: { createdAt: "asc" },
  },
} as const;

const PLAN_SELECT = {
  id: true,
  version: true,
  status: true,
  weekStart: true,
  inputHash: true,
  model: true,
  promptVersion: true,
  createdAt: true,
  tasks: { select: TASK_SELECT, orderBy: { position: "asc" } },
} as const;

/** The plan being worked on, or null before the first one is generated. */
export async function getActivePlan(projectId: string): Promise<PlanRecord | null> {
  await requireProject(projectId);

  return db.weeklyPlan.findFirst({
    where: { projectId, status: "ACTIVE" },
    orderBy: { version: "desc" },
    select: PLAN_SELECT,
  });
}

/**
 * Previous plans, newest first.
 *
 * Kept because regenerating supersedes rather than replaces: what the business
 * tried and what it chose not to try is the only honest record of the work, and
 * deleting it to keep one table tidy would delete the product's memory.
 */
export async function listSupersededPlans(projectId: string, take = 12) {
  await requireProject(projectId);

  return db.weeklyPlan.findMany({
    where: { projectId, status: "SUPERSEDED" },
    orderBy: { version: "desc" },
    take,
    select: {
      id: true,
      version: true,
      weekStart: true,
      createdAt: true,
      _count: { select: { tasks: true } },
    },
  });
}

export async function getPlan(projectId: string, planId: string): Promise<PlanRecord | null> {
  await requireProject(projectId);

  return db.weeklyPlan.findFirst({
    where: { id: planId, projectId },
    select: PLAN_SELECT,
  });
}

/**
 * What happened to the last plan.
 *
 * Read back into the next generation as a signal — section 9 of the brief is
 * explicit that the history informs the next plan and that the model does not
 * get to invent the operator's reasons, so this returns what they actually
 * said and nothing more.
 */
export async function lastPlanOutcome(projectId: string) {
  await requireProject(projectId);

  const previous = await db.weeklyPlan.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: {
      tasks: {
        select: { title: true, status: true, skipReason: true, completionNote: true },
      },
    },
  });

  if (!previous) return { completed: [], completedOutcomes: [], skipped: [] };

  const completedTasks = previous.tasks.filter((t) => t.status === "DONE");

  return {
    completed: completedTasks.map((t) => t.title),
    completedOutcomes: completedTasks
      .filter((t) => Boolean(t.completionNote?.trim()))
      .map((t) => ({ title: t.title, outcome: t.completionNote!.trim() })),
    skipped: previous.tasks
      .filter((t) => t.status === "SKIPPED")
      .map((t) => ({ title: t.title, reason: t.skipReason ?? "no reason given" })),
  };
}

/**
 * Counts for the plan header and the dashboard.
 *
 * Takes the projectId as well as the planId even though the planId alone would
 * find the rows. A function that can be called with any plan id is a function
 * that will be, and `plan: { projectId }` costs nothing.
 */
export async function planProgress(projectId: string, planId: string) {
  await requireProject(projectId);

  const rows = await db.marketingTask.groupBy({
    by: ["status"],
    where: { planId, plan: { projectId } },
    _count: { _all: true },
  });

  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row._count._all])) as Partial<
    Record<MarketingTaskStatus, number>
  >;

  const total = rows.reduce((sum, row) => sum + row._count._all, 0);

  return {
    total,
    todo: byStatus.TODO ?? 0,
    done: byStatus.DONE ?? 0,
    skipped: byStatus.SKIPPED ?? 0,
  };
}
