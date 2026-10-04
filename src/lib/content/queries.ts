import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import type {
  ContentPlatform,
  ContentStatus,
  ContentType,
  RecordSource,
} from "@/generated/prisma/enums";

/**
 * Content reads.
 *
 * Every function here begins with `requireProject`. The projectId reaching it
 * came from a page, and a page's parameters come from a URL — so "is this the
 * caller's project" is a question the query has to ask, not one it may assume
 * was asked upstream.
 */

export interface ContentItemRecord {
  id: string;
  platform: ContentPlatform;
  type: ContentType;
  status: ContentStatus;
  objective: string;
  audience: string | null;
  pillar: string | null;
  hook: string | null;
  body: string | null;
  cta: string | null;
  scheduledAt: Date | null;
  source: RecordSource;
  createdAt: Date;
}

export interface ContentFilters {
  platform?: ContentPlatform;
  status?: ContentStatus;
}

export async function listContentItems(
  projectId: string,
  filters: ContentFilters = {},
): Promise<ContentItemRecord[]> {
  await requireProject(projectId);

  return db.contentItem.findMany({
    where: {
      projectId,
      ...(filters.platform ? { platform: filters.platform } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
  });
}

/** Counts per status, for the workspace summary. */
export async function contentSummary(projectId: string) {
  await requireProject(projectId);

  const rows = await db.contentItem.groupBy({
    by: ["status"],
    where: { projectId },
    _count: { _all: true },
  });

  const counts = Object.fromEntries(rows.map((row) => [row.status, row._count._all]));

  return {
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    byStatus: counts as Partial<Record<ContentStatus, number>>,
  };
}

/** Distinct pillars in use, so the editor can suggest existing themes. */
export async function listPillars(projectId: string): Promise<string[]> {
  await requireProject(projectId);

  const rows = await db.contentItem.findMany({
    where: { projectId, pillar: { not: null } },
    select: { pillar: true },
    distinct: ["pillar"],
  });

  return rows
    .map((row) => row.pillar)
    .filter((pillar): pillar is string => Boolean(pillar))
    .sort();
}
