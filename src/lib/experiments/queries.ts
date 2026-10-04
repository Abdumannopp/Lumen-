import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import type { ExperimentStatus } from "@/generated/prisma/enums";

/**
 * Experiment reads.
 *
 * Every function here begins with `requireProject`. The projectId reaching it
 * came from a page, and a page's parameters come from a URL — so "is this the
 * caller's project" is a question the query has to ask, not one it may assume
 * was asked upstream.
 */

export interface ExperimentRecord {
  id: string;
  name: string;
  hypothesis: string;
  targetMetric: string;
  action: string;
  expectedResult: string | null;
  startDate: Date | null;
  endDate: Date | null;
  status: ExperimentStatus;
  actualResult: string | null;
  learning: string | null;
  recommendationId: string | null;
  recommendationTitle: string | null;
  createdAt: Date;
}

const STATUS_RANK: Record<ExperimentStatus, number> = {
  RUNNING: 0,
  PLANNED: 1,
  IDEA: 2,
  COMPLETED: 3,
  CANCELLED: 4,
};

export async function listExperiments(projectId: string): Promise<ExperimentRecord[]> {
  await requireProject(projectId);

  const rows = await db.experiment.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: { recommendation: { select: { title: true } } },
  });

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      hypothesis: row.hypothesis,
      targetMetric: row.targetMetric,
      action: row.action,
      expectedResult: row.expectedResult,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
      actualResult: row.actualResult,
      learning: row.learning,
      recommendationId: row.recommendationId,
      recommendationTitle: row.recommendation?.title ?? null,
      createdAt: row.createdAt,
    }))
    // Live work first — running, then planned, then ideas — with finished ones last.
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
}

/**
 * How many completed experiments carry a learning.
 *
 * This is what actually feeds future AI context, so it is surfaced separately
 * from the completed count: an experiment finished without a written learning
 * contributes nothing downstream, and the operator should be able to see that.
 */
export async function countLearnings(projectId: string) {
  await requireProject(projectId);

  const [completed, withLearning] = await Promise.all([
    db.experiment.count({ where: { projectId, status: "COMPLETED" } }),
    db.experiment.count({ where: { projectId, status: "COMPLETED", learning: { not: null } } }),
  ]);

  return { completed, withLearning };
}
