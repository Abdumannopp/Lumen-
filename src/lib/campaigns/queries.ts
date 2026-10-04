import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import type { CampaignStatus, RecordSource } from "@/generated/prisma/enums";
import type { NormalisedAllocation } from "@/lib/campaigns/agent";

/**
 * Campaign reads. Json columns are parsed defensively.
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

function toAllocation(value: unknown): NormalisedAllocation[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.channel !== "string" || typeof row.percent !== "number") return [];

    return [
      {
        channel: row.channel,
        percent: row.percent,
        amount: typeof row.amount === "number" ? row.amount : null,
        rationale: typeof row.rationale === "string" ? row.rationale : "",
      },
    ];
  });
}

function toKpis(value: unknown): { metric: string; why: string }[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.metric !== "string") return [];
    return [{ metric: row.metric, why: typeof row.why === "string" ? row.why : "" }];
  });
}

export interface CampaignRecord {
  id: string;
  name: string;
  objective: string;
  audience: string | null;
  offer: string | null;
  channels: string[];
  totalBudgetAmount: number | null;
  totalBudgetCurrency: string | null;
  budgetAllocation: NormalisedAllocation[];
  startDate: Date | null;
  endDate: Date | null;
  messaging: string[];
  creativeConcept: string | null;
  landingPage: string | null;
  kpiFramework: { metric: string; why: string }[];
  funnel: string[];
  status: CampaignStatus;
  source: RecordSource;
  createdAt: Date;
}

function toRecord(row: {
  id: string;
  name: string;
  objective: string;
  audience: string | null;
  offer: string | null;
  channels: unknown;
  totalBudgetAmount: number | null;
  totalBudgetCurrency: string | null;
  budgetAllocation: unknown;
  startDate: Date | null;
  endDate: Date | null;
  messaging: unknown;
  creativeConcept: string | null;
  landingPage: string | null;
  kpiFramework: unknown;
  funnel: unknown;
  status: CampaignStatus;
  source: RecordSource;
  createdAt: Date;
}): CampaignRecord {
  return {
    ...row,
    channels: toStringList(row.channels),
    budgetAllocation: toAllocation(row.budgetAllocation),
    messaging: toStringList(row.messaging),
    kpiFramework: toKpis(row.kpiFramework),
    funnel: toStringList(row.funnel),
  };
}

export async function listCampaigns(projectId: string): Promise<CampaignRecord[]> {
  await requireProject(projectId);

  const rows = await db.campaign.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }],
  });

  return rows.map(toRecord);
}

/** Scoped through the project so a foreign id cannot be opened. */
export async function getCampaign(projectId: string, campaignId: string) {
  await requireProject(projectId);

  const row = await db.campaign.findFirst({ where: { id: campaignId, projectId } });
  return row ? toRecord(row) : null;
}
