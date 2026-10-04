"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { projectInWorkspace } from "@/lib/auth/dal";
import { logger } from "@/lib/logger";
import { runAgent } from "@/lib/ai/runtime";
import { metering } from "@/lib/usage/metering";
import { FEATURES } from "@/config/usage";
import { AIError } from "@/lib/ai/errors";
import { competitorSchema, scoutAgent, type CompetitorInput } from "@/lib/intelligence/agent";
import { listCompetitors } from "@/lib/intelligence/queries";

/**
 * Intelligence writes.
 *
 * Competitor records are the operator's data and are never touched by the
 * agent. SCOUT only produces insights, and regeneration replaces only insights
 * SCOUT itself produced — the same protection rule as PULSE.
 */

export interface IntelligenceResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  competitorId?: string;
}

function aiErrorMessage(error: unknown) {
  const retryable = error instanceof AIError ? error.retryable : false;

  return retryable
    ? "The AI provider did not respond. Nothing was changed — try again."
    : "That request could not be completed. Nothing was changed.";
}

export async function saveCompetitorAction(
  projectId: string,
  input: CompetitorInput & { competitorId?: string },
): Promise<IntelligenceResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const parsed = competitorSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  const data = {
    name: parsed.data.name,
    website: parsed.data.website,
    description: parsed.data.description,
    strengths: parsed.data.strengths as never,
    weaknesses: parsed.data.weaknesses as never,
    positioning: parsed.data.positioning,
    pricingNotes: parsed.data.pricingNotes,
    marketingNotes: parsed.data.marketingNotes,
  };

  try {
    if (input.competitorId) {
      const updated = await db.competitor.updateMany({
        where: { id: input.competitorId, projectId },
        data,
      });

      if (updated.count === 0) return { ok: false, message: "That competitor no longer exists." };

      revalidatePath("/intelligence");
      return { ok: true, competitorId: input.competitorId };
    }

    const created = await db.competitor.create({ data: { projectId, ...data } });

    revalidatePath("/intelligence");
    return { ok: true, competitorId: created.id };
  } catch (error) {
    logger.error("Competitor write failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "The competitor could not be saved." };
  }
}

export async function deleteCompetitorAction(
  projectId: string,
  competitorId: string,
): Promise<IntelligenceResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const removed = await db.competitor.deleteMany({ where: { id: competitorId, projectId } });

  if (removed.count === 0) return { ok: false, message: "That competitor does not exist." };

  revalidatePath("/intelligence");
  return { ok: true };
}

/**
 * Run SCOUT over the recorded competitors.
 *
 * Refuses when there is nothing substantive to analyse. That refusal is the
 * feature: without it the model would be asked to produce competitive insight
 * from an empty set, and it would oblige by inventing one.
 */
export async function generateInsightsAction(
  projectId: string,
  guidance?: string,
): Promise<IntelligenceResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const competitors = await listCompetitors(projectId);

  const usable = competitors.filter(
    (competitor) =>
      competitor.description ||
      competitor.strengths.length > 0 ||
      competitor.weaknesses.length > 0 ||
      competitor.positioning ||
      competitor.pricingNotes ||
      competitor.marketingNotes,
  );

  if (usable.length === 0) {
    return {
      ok: false,
      message:
        "Record at least one competitor with some detail first. SCOUT has no internet access — it can only analyse what you have written down.",
    };
  }

  try {
    const output = await runAgent(scoutAgent, {
      projectId,
      payload: {
        competitors: usable.map((competitor) => ({
          name: competitor.name,
          website: competitor.website,
          description: competitor.description,
          strengths: competitor.strengths,
          weaknesses: competitor.weaknesses,
          positioning: competitor.positioning,
          pricingNotes: competitor.pricingNotes,
          marketingNotes: competitor.marketingNotes,
        })),
        guidance,
      },
    }, metering(owned, FEATURES.intelligence));

    // Replace only what SCOUT produced; anything the operator wrote survives.
    const removed = await db.marketInsight.deleteMany({ where: { projectId, source: "AI" } });

    await db.marketInsight.createMany({
      data: output.result.insights.map((insight) => ({
        projectId,
        kind: insight.kind,
        title: insight.title,
        detail: insight.detail,
        evidence: insight.evidence as never,
        assumptions: insight.assumptions as never,
        unknowns: insight.unknowns as never,
        source: "AI" as const,
        agentRunId: output.runId,
      })),
    });

    logger.info("Market insights generated", {
      projectId,
      created: output.result.insights.length,
      replaced: removed.count,
      competitors: usable.length,
    });

    revalidatePath("/intelligence");
    return { ok: true };
  } catch (error) {
    logger.error("Insight generation failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: aiErrorMessage(error) };
  }
}

export async function deleteInsightAction(
  projectId: string,
  insightId: string,
): Promise<IntelligenceResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const removed = await db.marketInsight.deleteMany({ where: { id: insightId, projectId } });

  if (removed.count === 0) return { ok: false, message: "That insight does not exist." };

  revalidatePath("/intelligence");
  return { ok: true };
}
