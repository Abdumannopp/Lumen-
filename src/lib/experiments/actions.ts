"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { projectInWorkspace } from "@/lib/auth/dal";
import { logger } from "@/lib/logger";
import { parseDayInput } from "@/lib/date";
import { PRODUCT_EVENTS, trackProductEvent } from "@/lib/product-analytics/events";
import {
  experimentSchema,
  experimentStatusKeys,
  type ExperimentInput,
  type ExperimentStatusKey,
} from "@/lib/experiments/agent";

/**
 * Experiment writes.
 *
 * One rule shapes this file: **an experiment cannot be completed without a
 * result and a learning**. Only completed experiments carrying a learning are
 * read back into project context, so allowing a silent completion would let the
 * feedback loop quietly do nothing while appearing to work.
 */

export interface ExperimentResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  experimentId?: string;
}

export async function saveExperimentAction(
  projectId: string,
  input: ExperimentInput & { experimentId?: string },
): Promise<ExperimentResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const parsed = experimentSchema.safeParse(input);

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

  if (parsed.data.status === "COMPLETED") {
    const missing: Record<string, string[]> = {};
    if (!parsed.data.actualResult) missing.actualResult = ["Record what actually happened."];
    if (!parsed.data.learning) missing.learning = ["Write down what you learned."];

    if (Object.keys(missing).length > 0) {
      return {
        ok: false,
        message:
          "A completed experiment needs its result and its learning — without them it teaches nothing and adds nothing to future advice.",
        fieldErrors: missing,
      };
    }
  }

  // Only link a recommendation that belongs to this project.
  let recommendationId: string | null = null;
  if (parsed.data.recommendationId) {
    const owned = await db.recommendation.findFirst({
      where: { id: parsed.data.recommendationId, projectId },
      select: { id: true },
    });
    recommendationId = owned?.id ?? null;
  }

  const data = {
    name: parsed.data.name,
    hypothesis: parsed.data.hypothesis,
    targetMetric: parsed.data.targetMetric,
    action: parsed.data.action,
    expectedResult: parsed.data.expectedResult,
    startDate,
    endDate,
    status: parsed.data.status,
    actualResult: parsed.data.actualResult,
    learning: parsed.data.learning,
    recommendationId,
  };

  try {
    if (input.experimentId) {
      const updated = await db.experiment.updateMany({
        where: { id: input.experimentId, projectId },
        data,
      });

      if (updated.count === 0) return { ok: false, message: "That experiment no longer exists." };

      revalidatePath("/growth/experiments");
      return { ok: true, experimentId: input.experimentId };
    }

    const created = await db.experiment.create({
      data: { projectId, ...data },
      select: { id: true },
    });

    await trackProductEvent({
      workspaceId: owned.workspaceId,
      userId: owned.userId,
      projectId,
      eventName: PRODUCT_EVENTS.EXPERIMENT_CREATED,
    });

    logger.info("Experiment saved", { projectId, experimentId: created.id });

    revalidatePath("/growth/experiments");
    return { ok: true, experimentId: created.id };
  } catch (error) {
    logger.error("Experiment write failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "The experiment could not be saved." };
  }
}

/**
 * Turn a recommendation into an experiment.
 *
 * The recommendation's insight becomes the hypothesis and its action becomes the
 * action, because that is exactly what the two fields already are — restating
 * them by hand would only introduce drift.
 */
export async function experimentFromRecommendationAction(
  projectId: string,
  recommendationId: string,
): Promise<ExperimentResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const recommendation = await db.recommendation.findFirst({
    where: { id: recommendationId, projectId },
  });

  if (!recommendation) return { ok: false, message: "That recommendation does not exist." };

  const existing = await db.experiment.findFirst({
    where: { projectId, recommendationId },
    select: { id: true },
  });

  if (existing) {
    return { ok: false, message: "An experiment already exists for that recommendation." };
  }

  const created = await db.experiment.create({
    data: {
      projectId,
      recommendationId,
      name: recommendation.title,
      hypothesis: `${recommendation.insight} ${recommendation.reason}`.trim(),
      // The metric is deliberately left as a prompt rather than guessed: what a
      // recommendation should be judged by is a decision, not an inference.
      targetMetric: "Set the metric this is judged by",
      action: recommendation.action,
      status: "PLANNED",
    },
    select: { id: true },
  });

  // Starting the work is a decision about the recommendation too.
  await db.recommendation.updateMany({
    where: { id: recommendationId, projectId },
    data: { status: "IN_PROGRESS" },
  });

  revalidatePath("/growth");
  revalidatePath("/growth/experiments");

  return { ok: true, experimentId: created.id };
}

export async function setExperimentStatusAction(
  projectId: string,
  experimentId: string,
  status: ExperimentStatusKey,
): Promise<ExperimentResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  // A server action is a public HTTP endpoint: the TypeScript parameter type is
  // a compile-time promise, not a runtime one. An unrecognised value reached
  // Prisma and threw, turning a bad request into a 500.
  if (!experimentStatusKeys.includes(status)) {
    return { ok: false, message: "That is not a valid status." };
  }

  const existing = await db.experiment.findFirst({
    where: { id: experimentId, projectId },
    select: { actualResult: true, learning: true },
  });

  if (!existing) return { ok: false, message: "That experiment does not exist." };

  // The same guard as the form, so the shortcut cannot bypass it.
  if (status === "COMPLETED" && (!existing.actualResult || !existing.learning)) {
    return {
      ok: false,
      message: "Record the result and the learning before marking this complete.",
    };
  }

  await db.experiment.updateMany({ where: { id: experimentId, projectId }, data: { status } });

  if (status === "COMPLETED") {
    await trackProductEvent({
      workspaceId: owned.workspaceId,
      userId: owned.userId,
      projectId,
      eventName: PRODUCT_EVENTS.EXPERIMENT_COMPLETED,
    });
  }

  revalidatePath("/growth/experiments");
  return { ok: true, experimentId };
}

export async function deleteExperimentAction(
  projectId: string,
  experimentId: string,
): Promise<ExperimentResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const removed = await db.experiment.deleteMany({ where: { id: experimentId, projectId } });

  if (removed.count === 0) return { ok: false, message: "That experiment does not exist." };

  revalidatePath("/growth/experiments");
  return { ok: true };
}
