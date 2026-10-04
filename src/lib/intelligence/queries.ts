import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import type { InsightKind, RecordSource } from "@/generated/prisma/enums";

/**
 * Intelligence reads. Json lists are parsed defensively on the way out.
 *
 * Every function here begins with `requireProject`. The projectId reaching it
 * came from a page, and a page's parameters come from a URL — so "is this the
 * caller's project" is a question the query has to ask, not one it may assume
 * was asked upstream.
 */

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export interface CompetitorRecord {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  strengths: string[];
  weaknesses: string[];
  positioning: string | null;
  pricingNotes: string | null;
  marketingNotes: string | null;
}

export interface InsightRecord {
  id: string;
  kind: InsightKind;
  title: string;
  detail: string;
  evidence: string[];
  assumptions: string[];
  unknowns: string[];
  source: RecordSource;
  createdAt: Date;
}

export async function listCompetitors(projectId: string): Promise<CompetitorRecord[]> {
  await requireProject(projectId);

  const rows = await db.competitor.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    website: row.website,
    description: row.description,
    strengths: toStringList(row.strengths),
    weaknesses: toStringList(row.weaknesses),
    positioning: row.positioning,
    pricingNotes: row.pricingNotes,
    marketingNotes: row.marketingNotes,
  }));
}

export async function listInsights(projectId: string): Promise<InsightRecord[]> {
  await requireProject(projectId);

  const rows = await db.marketInsight.findMany({
    where: { projectId },
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    evidence: toStringList(row.evidence),
    assumptions: toStringList(row.assumptions),
    unknowns: toStringList(row.unknowns),
    source: row.source,
    createdAt: row.createdAt,
  }));
}

/**
 * How much SCOUT has to work with.
 *
 * Used to decide whether analysis is worth running at all: with no competitors
 * recorded there is nothing to analyse, and an insight generated from nothing
 * would be exactly the fabrication this module exists to prevent.
 */
export async function getIntelligenceReadiness(projectId: string) {
  await requireProject(projectId);

  const competitors = await listCompetitors(projectId);

  const detailed = competitors.filter(
    (competitor) =>
      competitor.description ||
      competitor.strengths.length > 0 ||
      competitor.weaknesses.length > 0 ||
      competitor.positioning ||
      competitor.pricingNotes ||
      competitor.marketingNotes,
  );

  return {
    competitorCount: competitors.length,
    detailedCount: detailed.length,
    /** At least one competitor with something beyond a name. */
    canAnalyse: detailed.length > 0,
  };
}
