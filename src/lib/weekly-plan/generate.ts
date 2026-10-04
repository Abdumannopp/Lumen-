import "server-only";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { projectInWorkspace } from "@/lib/auth/dal";
import { AIError } from "@/lib/ai/errors";
import { runAgent } from "@/lib/ai/runtime";
import { PROMPT_VERSION } from "@/config/weekly-plan";
import { toDayInput } from "@/lib/date";
import { getBusinessProfile } from "@/lib/business-profile/queries";
import { cadenceAgent } from "@/lib/weekly-plan/agent";
import {
  allowedChannels,
  applyGuardrails,
  hasZeroBudget,
  hashPlanInputs,
} from "@/lib/weekly-plan/guardrails";
import { lastPlanOutcome } from "@/lib/weekly-plan/queries";
import { weekStartFor } from "@/lib/weekly-plan/week";
import { metering } from "@/lib/usage/metering";
import { FEATURES } from "@/config/usage";
import { QuotaExceededError } from "@/lib/usage/quota";
import { DuplicateRunError } from "@/lib/ai/runtime";
import { PRODUCT_EVENTS, trackProductEvent } from "@/lib/product-analytics/events";

/**
 * Generating a weekly plan.
 *
 * One rule shapes this whole file: **a plan is written whole or not at all.**
 *
 * Generation is a model call, and model calls fail in the middle. A plan that
 * is half-written is worse than no plan — the operator sees three tasks, has no
 * way to know four were lost, and works from a list that was never the answer.
 * So nothing is written until the output has passed the schema and the
 * guardrails, and the write itself is one transaction.
 *
 * The second rule follows from the first: **regenerating never overwrites.**
 * The previous plan is marked SUPERSEDED and keeps its tasks, its DONE marks
 * and its skip reasons. That history is what the next plan reads, and it is the
 * only record of what the business actually tried.
 *
 * Separate from `actions.ts` for one reason: `providerOptions`. A Server Action
 * is callable from any browser, and an argument that scripts the AI provider's
 * behaviour must not be. The action below passes none; the development-only
 * route at /api/dev/plan-scenario passes them, which is how "a failed
 * generation saves nothing" is proved against the real code path rather than a
 * copy of it.
 */

export interface GenerateOptions {
  guidance?: string;
  /**
   * Scripted provider behaviour. Never set from a Server Action — see above.
   */
  providerOptions?: Record<string, unknown>;
}

export interface PlanResult {
  ok: boolean;
  message?: string;
  planId?: string;
  /** Suggestions the guardrails removed, so a short plan explains itself. */
  dropped?: { title: string; reason: string }[];
  /** The allowance is spent — distinct from the request having failed. */
  quotaExceeded?: boolean;
}

function aiErrorMessage(error: unknown) {
  const retryable = error instanceof AIError ? error.retryable : false;

  return retryable
    ? "The AI provider did not respond. Nothing was saved — try again."
    : "The plan could not be generated. Nothing was saved.";
}

export async function generateWeeklyPlan(
  projectId: string,
  input: GenerateOptions = {},
): Promise<PlanResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { updatedAt: true },
  });

  if (!project) return { ok: false, message: "This project no longer exists." };

  const profile = await getBusinessProfile(projectId);

  if (!profile?.completedAt) {
    return {
      ok: false,
      message:
        "Finish the business profile first. A plan built on half an answer is a plan for a business that does not exist.",
    };
  }

  const inputs = {
    channels: profile.currentMarketingChannels,
    budgetAmount: profile.monthlyBudgetAmount,
  };

  const weekStart = weekStartFor(new Date());
  const weekStartInput = toDayInput(weekStart);
  const outcome = await lastPlanOutcome(projectId);

  // Resolved before the run so the idempotency key can carry it. Reading it
  // again inside the transaction is what makes the write correct under a race;
  // this copy only has to be stable enough to key on.
  const latestBefore = await db.weeklyPlan.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestBefore?.version ?? 0) + 1;

  const inputHash = hashPlanInputs({
    projectId,
    weekStart: weekStartInput,
    channels: inputs.channels,
    budgetAmount: inputs.budgetAmount,
    profileUpdatedAt: profile.updatedAt.toISOString(),
    projectUpdatedAt: project.updatedAt.toISOString(),
    guidance: input.guidance,
  });

  try {
    const output = await runAgent(
      cadenceAgent,
      {
        projectId,
        payload: {
          weekStart: weekStartInput,
          allowedChannels: allowedChannels(inputs),
          zeroBudget: hasZeroBudget(inputs),
          completed: outcome.completed,
          completedOutcomes: outcome.completedOutcomes,
          skipped: outcome.skipped,
          guidance: input.guidance,
        },
      },
      metering(owned, FEATURES.weeklyPlan, {
        providerOptions: input.providerOptions,
        promptVersion: PROMPT_VERSION,
        schemaVersion: PROMPT_VERSION,
        /**
         * The same question asked twice is one run.
         *
         * `inputHash` already fingerprints the business, the week and the
         * guidance, so two clicks a second apart produce the same key and the
         * second is refused by the unique index before the provider is called.
         *
         * Two *deliberate* regenerations of an unchanged business would also
         * collide, which is why the key carries the version this plan would
         * become: asking again after seeing the answer is a different request,
         * and the operator is allowed to make it.
         */
        idempotencyKey: `plan:${inputHash}:${nextVersion}`,
      }),
    );

    const { tasks, dropped } = applyGuardrails(output.result.tasks, inputs);

    // Everything the model returned failed the rules. That is a real answer,
    // not a crash — and writing an empty plan would present it as a finished
    // week's work.
    if (tasks.length === 0) {
      logger.warn("Weekly plan rejected by guardrails", {
        projectId,
        runId: output.runId,
        dropped: dropped.length,
      });

      return {
        ok: false,
        dropped,
        message:
          "Nothing in that plan was something this business could act on. Nothing was saved — try again, or add more detail to the business profile.",
      };
    }

    const planId = await db.$transaction(async (tx) => {
      const latest = await tx.weeklyPlan.findFirst({
        where: { projectId },
        orderBy: { version: "desc" },
        select: { version: true },
      });

      // Supersede inside the transaction, so there is never a moment with two
      // ACTIVE plans and never one with none.
      await tx.weeklyPlan.updateMany({
        where: { projectId, status: "ACTIVE" },
        data: { status: "SUPERSEDED" },
      });

      const plan = await tx.weeklyPlan.create({
        data: {
          workspaceId: owned.workspaceId,
          projectId,
          version: (latest?.version ?? 0) + 1,
          weekStart,
          inputHash,
          model: output.model,
          promptVersion: PROMPT_VERSION,
          agentRunId: output.runId,
        },
        select: { id: true },
      });

      for (const [position, task] of tasks.entries()) {
        await tx.marketingTask.create({
          data: {
            planId: plan.id,
            title: task.title,
            why: task.why,
            steps: task.steps,
            channel: task.channel,
            priority: task.priority,
            expectedResult: task.expectedResult,
            position,
            evidence: {
              create: task.evidence.map((item) => ({
                claim: item.claim,
                sourceUrl: item.sourceUrl ?? null,
                sourceTitle: item.sourceTitle ?? null,
                confidence: item.confidence,
              })),
            },
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          workspaceId: owned.workspaceId,
          actorId: owned.userId,
          action: "plan.generated",
          subjectType: "weeklyPlan",
          subjectId: plan.id,
          detail: {
            projectId,
            version: (latest?.version ?? 0) + 1,
            tasks: tasks.length,
            dropped: dropped.length,
            promptVersion: PROMPT_VERSION,
          },
        },
      });

      return plan.id;
    });

    await trackProductEvent({
      workspaceId: owned.workspaceId,
      userId: owned.userId,
      projectId,
      eventName: PRODUCT_EVENTS.WEEKLY_PLAN_GENERATED,
      metadata: { tasks: tasks.length },
    });

    logger.info("Weekly plan generated", {
      projectId,
      planId,
      tasks: tasks.length,
      dropped: dropped.length,
    });

    revalidatePath("/plan");
    revalidatePath("/overview");

    return { ok: true, planId, dropped };
  } catch (error) {
    // Out of allowance is not a failure of the request — it is an answer, and
    // one the person can act on. Reported as itself rather than folded into
    // "something went wrong".
    if (error instanceof QuotaExceededError) {
      return {
        ok: false,
        quotaExceeded: true,
        message: `This workspace has used all ${error.allowance.limit} of its AI actions for the month. The allowance renews on ${error.allowance.periodEnd.toISOString().slice(0, 10)}.`,
      };
    }

    // The same request arrived twice. Nothing was spent, and the first one is
    // either already finished or still running.
    if (error instanceof DuplicateRunError) {
      return {
        ok: false,
        message: "That plan is already being generated. Give it a moment.",
      };
    }

    logger.error("Weekly plan generation failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });

    return { ok: false, message: aiErrorMessage(error) };
  }
}
