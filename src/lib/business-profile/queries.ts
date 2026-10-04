import "server-only";

import { cache } from "react";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import type { BusinessProfile as BusinessProfileRow } from "@/generated/prisma/client";
import { type ProjectRecord, toProjectRecord } from "@/lib/projects/queries";
import { REQUIRED_FOR_COMPLETION } from "@/lib/validation/business-profile";

/**
 * Business profile reads.
 *
 * `getBusinessContext` is the important one: it merges the Project row (which
 * owns identity and market) with the BusinessProfile row (which owns the deeper
 * interview answers) into a single object. Agents read that, not the two tables
 * separately, so they never see a half-picture.
 *
 * Every function here begins with `requireProject`. The projectId reaching it
 * came from a page, and a page's parameters come from a URL — so "is this the
 * caller's project" is a question the query has to ask, not one it may assume
 * was asked upstream.
 */

/** A profile with its JSON list columns decoded to `string[]`. */
export type BusinessProfileRecord = Omit<
  BusinessProfileRow,
  "currentMarketingChannels" | "currentChallenges" | "knownCompetitors" | "brandVoice"
> & {
  currentMarketingChannels: string[];
  currentChallenges: string[];
  knownCompetitors: string[];
  brandVoice: string[];
};

export function toBusinessProfileRecord(row: BusinessProfileRow): BusinessProfileRecord {
  return { ...row };
}

export const getBusinessProfile = cache(
  async (projectId: string): Promise<BusinessProfileRecord | null> => {
    await requireProject(projectId);

    const row = await db.businessProfile.findUnique({ where: { projectId } });
    return row ? toBusinessProfileRecord(row) : null;
  },
);

export interface BusinessContext {
  project: ProjectRecord;
  profile: BusinessProfileRecord | null;
  /** Merged view — the shape downstream features should consume. */
  business: {
    name: string;
    website: string | null;
    industry: string;
    country: string;
    targetMarkets: string[];
    description: string | null;
    businessStage: ProjectRecord["businessStage"];
    primaryGoal: ProjectRecord["primaryGoal"];
    productOrService: string | null;
    businessModel: BusinessProfileRecord["businessModel"] | null;
    targetCustomers: string | null;
    currentMarketingChannels: string[];
    monthlyBudget: { amount: number; currency: string } | null;
    currentChallenges: string[];
    knownCompetitors: string[];
    socialLinks: { platform: string; url: string }[];
    brandVoice: string[];
    notes: string | null;
  };
  completion: ProfileCompletion;
}

export interface ProfileCompletion {
  /** Required answers that are still missing. */
  missing: string[];
  answered: number;
  total: number;
  percent: number;
  isComplete: boolean;
  /** Step to resume on, from the last saved position. */
  resumeStep: number;
}

/**
 * Completion is derived from the data, not from a stored flag, so it can never
 * disagree with what is actually in the row. `completedAt` records *when* the
 * flow was finished; it is not the source of truth for whether it is valid.
 */
export function computeCompletion(
  project: ProjectRecord,
  profile: BusinessProfileRecord | null,
): ProfileCompletion {
  const values: Record<string, unknown> = {
    name: project.name,
    industry: project.industry,
    country: project.country,
    businessStage: project.businessStage,
    primaryGoal: project.primaryGoal,
    productOrService: profile?.productOrService ?? null,
    businessModel: profile?.businessModel ?? null,
    targetCustomers: profile?.targetCustomers ?? null,
  };

  const missing = REQUIRED_FOR_COMPLETION.filter((field) => {
    const value = values[field];
    return value === null || value === undefined || value === "";
  });

  const total = REQUIRED_FOR_COMPLETION.length;
  const answered = total - missing.length;

  return {
    missing: [...missing],
    answered,
    total,
    percent: Math.round((answered / total) * 100),
    isComplete: missing.length === 0 && profile?.completedAt != null,
    resumeStep: profile?.lastStep ?? 0,
  };
}

export async function getBusinessContext(projectId: string): Promise<BusinessContext | null> {
  await requireProject(projectId);

  const row = await db.project.findUnique({ where: { id: projectId } });
  if (!row) return null;

  const project = toProjectRecord(row);

  const profile = await getBusinessProfile(projectId);

  const socialLinks = (
    [
      ["LinkedIn", profile?.linkedinUrl],
      ["X", profile?.xUrl],
      ["Instagram", profile?.instagramUrl],
      ["Facebook", profile?.facebookUrl],
      ["YouTube", profile?.youtubeUrl],
      ["TikTok", profile?.tiktokUrl],
    ] as const
  )
    .filter(([, url]) => Boolean(url))
    .map(([platform, url]) => ({ platform, url: url as string }));

  return {
    project,
    profile,
    business: {
      name: project.name,
      website: project.website,
      industry: project.industry,
      country: project.country,
      targetMarkets: project.targetMarkets,
      description: project.description,
      businessStage: project.businessStage,
      primaryGoal: project.primaryGoal,
      productOrService: profile?.productOrService ?? null,
      businessModel: profile?.businessModel ?? null,
      targetCustomers: profile?.targetCustomers ?? null,
      currentMarketingChannels: profile?.currentMarketingChannels ?? [],
      monthlyBudget:
        profile?.monthlyBudgetAmount != null
          ? {
              amount: profile.monthlyBudgetAmount,
              currency: profile.monthlyBudgetCurrency ?? "USD",
            }
          : null,
      currentChallenges: profile?.currentChallenges ?? [],
      knownCompetitors: profile?.knownCompetitors ?? [],
      socialLinks,
      brandVoice: profile?.brandVoice ?? [],
      notes: profile?.notes ?? null,
    },
    completion: computeCompletion(project, profile),
  };
}
