"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { projectInWorkspace } from "@/lib/auth/dal";
import { logger } from "@/lib/logger";
import { parseDayInput } from "@/lib/date";
import { runAgent } from "@/lib/ai/runtime";
import { metering } from "@/lib/usage/metering";
import { FEATURES } from "@/config/usage";
import { AIError } from "@/lib/ai/errors";
import {
  campaignSchema,
  campaignStatusKeys,
  normaliseAllocation,
  orbitAgent,
  type CampaignInput,
  type CampaignStatusKey,
} from "@/lib/campaigns/agent";
import { getCampaign } from "@/lib/campaigns/queries";

/**
 * Campaign writes.
 *
 * Planning only. Nothing in this file contacts an ad platform, spends money or
 * changes anything outside this database.
 */

export interface CampaignResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  campaignId?: string;
}

function aiErrorMessage(error: unknown) {
  const retryable = error instanceof AIError ? error.retryable : false;

  return retryable
    ? "The AI provider did not respond. Nothing was created — try again."
    : "That request could not be completed. Nothing was created.";
}

export async function planCampaignAction(
  projectId: string,
  input: {
    brief: string;
    budgetAmount?: number | null;
    budgetCurrency?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    guidance?: string;
  },
): Promise<CampaignResult> {
  const project = await projectInWorkspace(projectId);
  if (!project) return { ok: false, message: "This project no longer exists." };

  if (!input.brief?.trim()) {
    return { ok: false, message: "Describe the campaign you want planned." };
  }

  // Stored days — see src/lib/date.ts.
  const startDate = parseDayInput(input.startDate);
  const endDate = parseDayInput(input.endDate);

  if (input.startDate && !startDate) {
    return { ok: false, message: "Enter a valid start date." };
  }

  if (input.endDate && !endDate) {
    return { ok: false, message: "Enter a valid end date." };
  }

  if (startDate && endDate && endDate < startDate) {
    return { ok: false, message: "The end date is before the start date." };
  }

  const budget =
    typeof input.budgetAmount === "number" && Number.isFinite(input.budgetAmount)
      ? Math.max(0, Math.round(input.budgetAmount))
      : null;

  try {
    const output = await runAgent(orbitAgent, {
      projectId,
      payload: {
        brief: input.brief.trim(),
        budgetAmount: budget ?? undefined,
        budgetCurrency: input.budgetCurrency ?? undefined,
        startDate: input.startDate ?? undefined,
        endDate: input.endDate ?? undefined,
        guidance: input.guidance,
      },
    }, metering(project, FEATURES.campaigns));

    // The model proposes shares; the money is computed here so the split always
    // totals the budget exactly.
    const allocation = normaliseAllocation(output.result.budgetAllocation, budget);

    const created = await db.campaign.create({
      data: {
        projectId,
        name: output.result.name,
        objective: output.result.objective,
        audience: output.result.audience,
        offer: output.result.offer,
        channels: output.result.channels as never,
        totalBudgetAmount: budget,
        totalBudgetCurrency: budget !== null ? (input.budgetCurrency ?? "USD") : null,
        budgetAllocation: allocation as never,
        startDate,
        endDate,
        messaging: output.result.messaging as never,
        creativeConcept: output.result.creativeConcept,
        kpiFramework: output.result.kpiFramework as never,
        funnel: output.result.funnel as never,
        status: "DRAFT",
        source: "AI",
        agentRunId: output.runId,
      },
      select: { id: true },
    });

    logger.info("Campaign planned", { projectId, campaignId: created.id });

    revalidatePath("/campaigns");
    return { ok: true, campaignId: created.id };
  } catch (error) {
    logger.error("Campaign planning failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: aiErrorMessage(error) };
  }
}

export async function saveCampaignAction(
  projectId: string,
  input: CampaignInput & { campaignId?: string },
): Promise<CampaignResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const parsed = campaignSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  // Stored days — see src/lib/date.ts. Parsed before comparing so an unreadable
  // date is rejected rather than compared as an Invalid Date, which is never
  // less than anything and so slipped past this check unnoticed.
  const startDate = parseDayInput(parsed.data.startDate);
  const endDate = parseDayInput(parsed.data.endDate);

  if (parsed.data.startDate && !startDate) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: { startDate: ["Enter a valid date."] },
    };
  }

  if (parsed.data.endDate && !endDate) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: { endDate: ["Enter a valid date."] },
    };
  }

  if (startDate && endDate && endDate < startDate) {
    return {
      ok: false,
      message: "The end date is before the start date.",
      fieldErrors: { endDate: ["The end date is before the start date."] },
    };
  }

  const data = {
    name: parsed.data.name,
    objective: parsed.data.objective,
    audience: parsed.data.audience,
    offer: parsed.data.offer,
    channels: parsed.data.channels as never,
    totalBudgetAmount: parsed.data.totalBudgetAmount,
    totalBudgetCurrency: parsed.data.totalBudgetAmount !== null
      ? (parsed.data.totalBudgetCurrency ?? "USD")
      : null,
    startDate,
    endDate,
    creativeConcept: parsed.data.creativeConcept,
    landingPage: parsed.data.landingPage,
    status: parsed.data.status,
  };

  try {
    if (input.campaignId) {
      const existing = await getCampaign(projectId, input.campaignId);
      if (!existing) return { ok: false, message: "That campaign no longer exists." };

      // Changing the budget re-derives the money from the existing shares, so
      // the split cannot drift out of sync with the total.
      const allocation =
        parsed.data.totalBudgetAmount !== existing.totalBudgetAmount
          ? normaliseAllocation(existing.budgetAllocation, parsed.data.totalBudgetAmount)
          : existing.budgetAllocation;

      await db.campaign.updateMany({
        where: { id: input.campaignId, projectId },
        data: { ...data, budgetAllocation: allocation as never, source: "EDITED" },
      });

      revalidatePath("/campaigns");
      return { ok: true, campaignId: input.campaignId };
    }

    const created = await db.campaign.create({
      data: {
        projectId,
        ...data,
        budgetAllocation: [] as never,
        messaging: [] as never,
        kpiFramework: [] as never,
        funnel: [] as never,
        source: "MANUAL",
      },
      select: { id: true },
    });

    revalidatePath("/campaigns");
    return { ok: true, campaignId: created.id };
  } catch (error) {
    logger.error("Campaign write failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "The campaign could not be saved." };
  }
}

/**
 * Move a campaign through its lifecycle.
 *
 * ACTIVE records that the operator is running it on their own ad accounts.
 * This action starts nothing and spends nothing.
 */
export async function setCampaignStatusAction(
  projectId: string,
  campaignId: string,
  status: CampaignStatusKey,
): Promise<CampaignResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  // A server action is a public HTTP endpoint: the TypeScript parameter type is
  // a compile-time promise, not a runtime one. An unrecognised value reached
  // Prisma and threw, turning a bad request into a 500.
  if (!campaignStatusKeys.includes(status)) {
    return { ok: false, message: "That is not a valid status." };
  }

  const updated = await db.campaign.updateMany({
    where: { id: campaignId, projectId },
    data: { status },
  });

  if (updated.count === 0) return { ok: false, message: "That campaign does not exist." };

  revalidatePath("/campaigns");
  return { ok: true, campaignId };
}

export async function deleteCampaignAction(
  projectId: string,
  campaignId: string,
): Promise<CampaignResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const removed = await db.campaign.deleteMany({ where: { id: campaignId, projectId } });

  if (removed.count === 0) return { ok: false, message: "That campaign does not exist." };

  revalidatePath("/campaigns");
  return { ok: true };
}
