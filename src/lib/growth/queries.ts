import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import type {
  RecommendationLevel,
  RecommendationPriority,
  RecommendationStatus,
  RecordSource,
} from "@/generated/prisma/enums";

/**
 * Growth reads.
 *
 * Every function here begins with `requireProject`. The projectId reaching it
 * came from a page, and a page's parameters come from a URL — so "is this the
 * caller's project" is a question the query has to ask, not one it may assume
 * was asked upstream.
 */

export interface RecommendationRecord {
  id: string;
  title: string;
  insight: string;
  reason: string;
  action: string;
  priority: RecommendationPriority;
  impact: RecommendationLevel;
  effort: RecommendationLevel;
  confidence: RecommendationLevel;
  confidenceReason: string;
  basedOn: string[];
  status: RecommendationStatus;
  source: RecordSource;
  createdAt: Date;
}

const PRIORITY_RANK: Record<RecommendationPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export async function listRecommendations(projectId: string): Promise<RecommendationRecord[]> {
  await requireProject(projectId);

  const rows = await db.recommendation.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return rows
    .map((row) => ({ ...row, basedOn: toStringList(row.basedOn) }))
    // Open work first, then by priority: a dismissed CRITICAL should not sit
    // above an open HIGH.
    .sort((a, b) => {
      const aOpen = a.status === "OPEN" || a.status === "ACCEPTED" || a.status === "IN_PROGRESS";
      const bOpen = b.status === "OPEN" || b.status === "ACCEPTED" || b.status === "IN_PROGRESS";
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    });
}
