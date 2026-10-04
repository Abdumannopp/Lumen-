"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { projectInWorkspace } from "@/lib/auth/dal";
import { logger } from "@/lib/logger";
import { runAgent } from "@/lib/ai/runtime";
import { metering } from "@/lib/usage/metering";
import { FEATURES } from "@/config/usage";
import { AIError } from "@/lib/ai/errors";
import { ProjectContextBuilder } from "@/lib/ai/context-builder";
import { PRODUCT_EVENTS, trackProductEvent } from "@/lib/product-analytics/events";
import {
  ascendAgent,
  clampConfidence,
  clampNote,
  maxConfidence,
  readEvidence,
  recommendationSchema,
  recommendationStatusKeys,
  type LevelKey,
  type RecommendationInput,
  type RecommendationStatusKey,
} from "@/lib/growth/agent";

/**
 * Growth writes.
 *
 * Generation replaces only OPEN AI recommendations. Anything the operator
 * accepted, started, completed, dismissed or wrote themselves survives — those
 * represent decisions, and a regeneration must not quietly erase a decision.
 */

export interface GrowthResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  created?: number;
  clamped?: number;
  recommendationId?: string;
}

function aiErrorMessage(error: unknown) {
  const retryable = error instanceof AIError ? error.retryable : false;

  return retryable
    ? "The AI provider did not respond. Nothing was changed — try again."
    : "That request could not be completed. Nothing was changed.";
}

export async function generateRecommendationsAction(
  projectId: string,
  guidance?: string,
): Promise<GrowthResult> {
  const project = await projectInWorkspace(projectId);
  if (!project) return { ok: false, message: "This project no longer exists." };

  try {
    // The same context the agent will read is inspected here, so the ceiling is
    // computed from what was actually gathered rather than assumed.
    const context = await new ProjectContextBuilder(projectId)
      .include(...ascendAgent.contextSources)
      .build();

    const evidence = readEvidence(context);
    const ceiling = maxConfidence(evidence);

    const output = await runAgent(ascendAgent, { projectId, payload: { guidance } }, metering(project, FEATURES.growth));

    let clampedCount = 0;

    const rows = output.result.recommendations.map((recommendation) => {
      const { level, clamped } = clampConfidence(recommendation.confidence as LevelKey, ceiling);
      if (clamped) clampedCount += 1;

      return {
        projectId,
        title: recommendation.title,
        insight: recommendation.insight,
        reason: recommendation.reason,
        action: recommendation.action,
        priority: recommendation.priority,
        impact: recommendation.impact,
        effort: recommendation.effort,
        confidence: level,
        confidenceReason: clamped
          ? `${recommendation.confidenceReason}${clampNote(ceiling)}`
          : recommendation.confidenceReason,
        basedOn: recommendation.basedOn as never,
        status: "OPEN" as const,
        source: "AI" as const,
        agentRunId: output.runId,
      };
    });

    const removed = await db.recommendation.deleteMany({
      where: { projectId, source: "AI", status: "OPEN" },
    });

    await db.recommendation.createMany({ data: rows });

    await trackProductEvent({
      workspaceId: project.workspaceId,
      userId: project.userId,
      projectId,
      eventName: PRODUCT_EVENTS.RECOMMENDATIONS_GENERATED,
      metadata: { count: rows.length },
    });

    logger.info("Recommendations generated", {
      projectId,
      created: rows.length,
      replaced: removed.count,
      ceiling,
      clamped: clampedCount,
      evidence: evidence.sources,
    });

    revalidatePath("/growth");
    return { ok: true, created: rows.length, clamped: clampedCount };
  } catch (error) {
    logger.error("Recommendation generation failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: aiErrorMessage(error) };
  }
}

export async function saveRecommendationAction(
  projectId: string,
  input: RecommendationInput & { recommendationId?: string },
): Promise<GrowthResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const parsed = recommendationSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  try {
    if (input.recommendationId) {
      const updated = await db.recommendation.updateMany({
        where: { id: input.recommendationId, projectId },
        data: { ...parsed.data, source: "EDITED" },
      });

      if (updated.count === 0) {
        return { ok: false, message: "That recommendation no longer exists." };
      }

      revalidatePath("/growth");
      return { ok: true, recommendationId: input.recommendationId };
    }

    const created = await db.recommendation.create({
      data: { projectId, ...parsed.data, basedOn: ["Written by the operator"] as never, source: "MANUAL" },
      select: { id: true },
    });

    revalidatePath("/growth");
    return { ok: true, recommendationId: created.id };
  } catch (error) {
    logger.error("Recommendation write failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "The recommendation could not be saved." };
  }
}

export async function setRecommendationStatusAction(
  projectId: string,
  recommendationId: string,
  status: RecommendationStatusKey,
): Promise<GrowthResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  // A server action is a public HTTP endpoint: the TypeScript parameter type is
  // a compile-time promise, not a runtime one. An unrecognised value reached
  // Prisma and threw, turning a bad request into a 500.
  if (!recommendationStatusKeys.includes(status)) {
    return { ok: false, message: "That is not a valid status." };
  }

  const recommendation = await db.recommendation.findFirst({
    where: { id: recommendationId, projectId },
    select: { status: true, source: true },
  });

  if (!recommendation) return { ok: false, message: "That recommendation does not exist." };

  if (recommendation.status === status) {
    return { ok: true, recommendationId };
  }

  await db.recommendation.update({
    where: { id: recommendationId },
    data: { status },
  });

  if (recommendation.source === "AI") {
    await trackProductEvent({
      workspaceId: owned.workspaceId,
      userId: owned.userId,
      projectId,
      eventName: PRODUCT_EVENTS.RECOMMENDATION_STATUS_CHANGED,
      metadata: { from: recommendation.status, to: status },
    });
  }

  revalidatePath("/growth");
  return { ok: true, recommendationId };
}

export async function deleteRecommendationAction(
  projectId: string,
  recommendationId: string,
): Promise<GrowthResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const removed = await db.recommendation.deleteMany({
    where: { id: recommendationId, projectId },
  });

  if (removed.count === 0) return { ok: false, message: "That recommendation does not exist." };

  revalidatePath("/growth");
  return { ok: true };
}
