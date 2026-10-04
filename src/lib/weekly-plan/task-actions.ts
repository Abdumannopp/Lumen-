"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { projectInWorkspace } from "@/lib/auth/dal";
import { SKIP_REASON_VALUES } from "@/config/weekly-plan";
import type { MarketingTaskStatus } from "@/generated/prisma/enums";
import { PRODUCT_EVENTS, trackProductEvent } from "@/lib/product-analytics/events";

/**
 * Marking work done, or deciding not to do it.
 *
 * Three states and no more: TODO, DONE, SKIPPED. The temptation with a task
 * list is to add "in progress", "blocked", "deferred" — and every one of those
 * is a state the operator has to maintain instead of doing the work. Two
 * decisions is the whole interface: I did it, or I am not going to.
 *
 * Four things are true of every mutation here.
 *
 * **It is authorised on the server.** The task id comes from the browser, and
 * it is checked against the caller's workspace through the task's plan and
 * project before anything is written.
 *
 * **It is idempotent.** Marking a task DONE twice is one DONE, and writes one
 * audit event, because a double-clicked button is not two decisions. This is
 * checked against the task's current state rather than against a token, so it
 * holds for a retried request as well as a repeated click.
 *
 * **It is audited.** DONE and SKIPPED both write an AuditEvent, and so does
 * reverting one. The audit table is append-only, so a task that was completed,
 * reopened and skipped leaves three rows — which is the actual history, and the
 * only version of it that cannot be rewritten by changing the task.
 *
 * **It is reversible.** Reopening a task clears the timestamps and the note.
 * The audit trail keeps them, which is the right split: the task says where
 * things stand, the audit says how they got there.
 */

export interface TaskResult {
  ok: boolean;
  message?: string;
  status?: MarketingTaskStatus;
}

const completionNote = z
  .string()
  .trim()
  .max(500, "Keep the note under 500 characters.")
  .optional();

const skipInput = z.object({
  reason: z.enum(SKIP_REASON_VALUES as [string, ...string[]], {
    message: "Choose a reason.",
  }),
  note: completionNote,
});

/**
 * The task, if the caller may act on it.
 *
 * One query, joining through plan → project, so ownership and existence are the
 * same question. Returns the workspace context too, because every write below
 * needs it for the audit row.
 */
async function ownedTask(taskId: string) {
  const task = await db.marketingTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      status: true,
      completionNote: true,
      plan: { select: { id: true, projectId: true } },
    },
  });

  if (!task) return null;

  const context = await projectInWorkspace(task.plan.projectId);

  return context ? { task, context } : null;
}

const NOT_FOUND = "That task does not exist.";

export async function completeTaskAction(taskId: string, note?: string): Promise<TaskResult> {
  const owned = await ownedTask(taskId);
  if (!owned) return { ok: false, message: NOT_FOUND };

  const parsed = completionNote.safeParse(note ?? undefined);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That note is too long." };
  }

  // Already done, and the note has not changed: nothing happened, so nothing is
  // written and no second audit row is created.
  if (owned.task.status === "DONE" && !parsed.data) {
    return { ok: true, status: "DONE" };
  }

  await db.$transaction(async (tx) => {
    await tx.marketingTask.update({
      where: { id: taskId },
      data: {
        status: "DONE",
        completedAt: new Date(),
        completionNote: parsed.data ?? null,
        // A task cannot be done and skipped at once.
        skippedAt: null,
        skipReason: null,
      },
    });

    await tx.auditEvent.create({
      data: {
        workspaceId: owned.context.workspaceId,
        actorId: owned.context.userId,
        action: "task.completed",
        subjectType: "marketingTask",
        subjectId: taskId,
        detail: {
          planId: owned.task.plan.id,
          title: owned.task.title,
          previousStatus: owned.task.status,
          hasNote: Boolean(parsed.data),
        },
      },
    });
  });

  await trackProductEvent({
    workspaceId: owned.context.workspaceId,
    userId: owned.context.userId,
    projectId: owned.task.plan.projectId,
    eventName: PRODUCT_EVENTS.TASK_COMPLETED,
  });

  logger.info("Task completed", { taskId, planId: owned.task.plan.id });

  revalidatePath("/plan");
  revalidatePath("/overview");

  return { ok: true, status: "DONE" };
}

export async function recordTaskOutcomeAction(taskId: string, note?: string): Promise<TaskResult> {
  const owned = await ownedTask(taskId);
  if (!owned) return { ok: false, message: NOT_FOUND };

  if (owned.task.status !== "DONE") {
    return { ok: false, message: "Complete the task before recording its outcome." };
  }

  const parsed = completionNote.safeParse(note ?? undefined);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That note is too long." };
  }

  if (owned.task.completionNote === (parsed.data ?? null)) {
    return { ok: true, status: "DONE" };
  }

  await db.$transaction(async (tx) => {
    await tx.marketingTask.update({
      where: { id: taskId },
      data: { completionNote: parsed.data ?? null },
    });

    await tx.auditEvent.create({
      data: {
        workspaceId: owned.context.workspaceId,
        actorId: owned.context.userId,
        action: "task.outcome_recorded",
        subjectType: "marketingTask",
        subjectId: taskId,
        detail: {
          planId: owned.task.plan.id,
          title: owned.task.title,
          hasOutcome: Boolean(parsed.data),
        },
      },
    });
  });

  await trackProductEvent({
    workspaceId: owned.context.workspaceId,
    userId: owned.context.userId,
    projectId: owned.task.plan.projectId,
    eventName: PRODUCT_EVENTS.TASK_OUTCOME_RECORDED,
    metadata: { hasOutcome: Boolean(parsed.data) },
  });

  logger.info("Task outcome recorded", {
    taskId,
    planId: owned.task.plan.id,
    hasOutcome: Boolean(parsed.data),
  });

  revalidatePath("/plan");
  revalidatePath("/overview");

  return { ok: true, status: "DONE" };
}

export async function skipTaskAction(
  taskId: string,
  input: { reason: string; note?: string },
): Promise<TaskResult> {
  const owned = await ownedTask(taskId);
  if (!owned) return { ok: false, message: NOT_FOUND };

  const parsed = skipInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Choose a reason." };
  }

  await db.$transaction(async (tx) => {
    await tx.marketingTask.update({
      where: { id: taskId },
      data: {
        status: "SKIPPED",
        skippedAt: new Date(),
        skipReason: parsed.data.reason,
        completionNote: parsed.data.note ?? null,
        completedAt: null,
      },
    });

    await tx.auditEvent.create({
      data: {
        workspaceId: owned.context.workspaceId,
        actorId: owned.context.userId,
        action: "task.skipped",
        subjectType: "marketingTask",
        subjectId: taskId,
        detail: {
          planId: owned.task.plan.id,
          title: owned.task.title,
          previousStatus: owned.task.status,
          reason: parsed.data.reason,
        },
      },
    });
  });

  await trackProductEvent({
    workspaceId: owned.context.workspaceId,
    userId: owned.context.userId,
    projectId: owned.task.plan.projectId,
    eventName: PRODUCT_EVENTS.TASK_SKIPPED,
  });

  logger.info("Task skipped", { taskId, planId: owned.task.plan.id, reason: parsed.data.reason });

  revalidatePath("/plan");
  revalidatePath("/overview");

  return { ok: true, status: "SKIPPED" };
}

/**
 * Put a task back on the list.
 *
 * The timestamps and the reason are cleared, because they describe a decision
 * that has been withdrawn and a stale "skipped because no budget" on an open
 * task is a lie the interface would keep telling. What actually happened stays
 * in the audit trail, which is the only place it belongs.
 */
export async function reopenTaskAction(taskId: string): Promise<TaskResult> {
  const owned = await ownedTask(taskId);
  if (!owned) return { ok: false, message: NOT_FOUND };

  if (owned.task.status === "TODO") return { ok: true, status: "TODO" };

  await db.$transaction(async (tx) => {
    await tx.marketingTask.update({
      where: { id: taskId },
      data: {
        status: "TODO",
        completedAt: null,
        completionNote: null,
        skippedAt: null,
        skipReason: null,
      },
    });

    await tx.auditEvent.create({
      data: {
        workspaceId: owned.context.workspaceId,
        actorId: owned.context.userId,
        action: "task.reopened",
        subjectType: "marketingTask",
        subjectId: taskId,
        detail: {
          planId: owned.task.plan.id,
          title: owned.task.title,
          previousStatus: owned.task.status,
        },
      },
    });
  });

  logger.info("Task reopened", { taskId, planId: owned.task.plan.id });

  revalidatePath("/plan");
  revalidatePath("/overview");

  return { ok: true, status: "TODO" };
}
