import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";

/**
 * Dashboard reads.
 *
 * One round of counts for the six areas the overview reports on, plus the small
 * slices it shows directly. Gathered here rather than in the page so the status
 * cards and the sections below them can never disagree about what exists.
 *
 * Everything is a real count. Where an area holds nothing the dashboard says
 * "nothing recorded yet" — it never renders a fabricated zero as if it were a
 * measured result, and it never claims a built module is unfinished.
 *
 * Every function here begins with `requireProject`. The projectId reaching it
 * came from a page, and a page's parameters come from a URL — so "is this the
 * caller's project" is a question the query has to ask, not one it may assume
 * was asked upstream.
 */

export interface DashboardSnapshot {
  strategy: { exists: boolean; version: number | null; updatedAt: Date | null };
  audience: { segments: number };
  content: { total: number; scheduled: number };
  campaigns: { total: number; active: number };
  analytics: { rows: number; lastEntry: Date | null };
  growth: { open: number; total: number };
  insights: { total: number };
  /** The few records the overview lists inline. */
  upcomingContent: {
    id: string;
    hook: string | null;
    objective: string;
    platform: string;
    scheduledAt: Date;
  }[];
  activeCampaigns: { id: string; name: string; objective: string; status: string }[];
  recentInsights: { id: string; title: string; kind: string; detail: string }[];
  topRecommendations: { id: string; title: string; priority: string; status: string }[];
}

export async function getDashboardSnapshot(projectId: string): Promise<DashboardSnapshot> {
  await requireProject(projectId);

  // Today's boundary in local time, matching how day columns are stored.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    strategy,
    segments,
    contentTotal,
    scheduledCount,
    campaignTotal,
    activeCount,
    metricRows,
    lastMetric,
    openRecommendations,
    recommendationTotal,
    insightTotal,
    upcomingContent,
    activeCampaigns,
    recentInsights,
    topRecommendations,
  ] = await Promise.all([
    // Mirrors getStrategy(): the current version is the one the pointer names,
    // falling back to the newest, so a restored earlier version is reported as
    // current rather than being overtaken by a later one.
    db.strategy
      .findUnique({ where: { projectId }, select: { currentVersionId: true } })
      .then(async (row) => {
        if (!row) return null;

        return db.strategyVersion.findFirst({
          where: row.currentVersionId
            ? { id: row.currentVersionId }
            : { strategy: { projectId } },
          orderBy: { version: "desc" },
          select: { version: true, createdAt: true },
        });
      }),
    db.audienceSegment.count({ where: { projectId } }),
    db.contentItem.count({ where: { projectId } }),
    db.contentItem.count({ where: { projectId, scheduledAt: { gte: startOfToday } } }),
    db.campaign.count({ where: { projectId } }),
    db.campaign.count({ where: { projectId, status: "ACTIVE" } }),
    db.marketingMetric.count({ where: { projectId } }),
    db.marketingMetric.findFirst({
      where: { projectId },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    db.recommendation.count({
      where: { projectId, status: { in: ["OPEN", "ACCEPTED", "IN_PROGRESS"] } },
    }),
    db.recommendation.count({ where: { projectId } }),
    db.marketInsight.count({ where: { projectId } }),
    db.contentItem.findMany({
      where: { projectId, scheduledAt: { gte: startOfToday } },
      orderBy: { scheduledAt: "asc" },
      take: 5,
      select: { id: true, hook: true, objective: true, platform: true, scheduledAt: true },
    }),
    db.campaign.findMany({
      where: { projectId, status: { in: ["ACTIVE", "PLANNED"] } },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { id: true, name: true, objective: true, status: true },
    }),
    db.marketInsight.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, title: true, kind: true, detail: true },
    }),
    db.recommendation.findMany({
      where: { projectId, status: { in: ["OPEN", "ACCEPTED", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, title: true, priority: true, status: true },
    }),
  ]);

  return {
    strategy: {
      exists: Boolean(strategy),
      version: strategy?.version ?? null,
      updatedAt: strategy?.createdAt ?? null,
    },
    audience: { segments },
    content: { total: contentTotal, scheduled: scheduledCount },
    campaigns: { total: campaignTotal, active: activeCount },
    analytics: { rows: metricRows, lastEntry: lastMetric?.date ?? null },
    growth: { open: openRecommendations, total: recommendationTotal },
    insights: { total: insightTotal },
    upcomingContent: upcomingContent.filter(
      (item): item is typeof item & { scheduledAt: Date } => item.scheduledAt !== null,
    ),
    activeCampaigns,
    recentInsights,
    topRecommendations,
  };
}
