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
  buildSchedule,
  contentPlanAgent,
  type FrequencyKey,
} from "@/lib/content/plan-agent";
import {
  contentItemSchema,
  contentStatusKeys,
  museAgent,
  type ContentItemInput,
  type ContentStatusKey,
  type ContentTypeKey,
  type PlatformKey,
} from "@/lib/content/agent";

/**
 * Content writes.
 *
 * Generation always appends. Unlike PULSE and SCOUT there is no "replace what
 * the agent made" rule here, because content is cumulative by nature: a second
 * batch of Instagram posts does not supersede the first, and silently deleting
 * last week's drafts would be indefensible. Removing content is an explicit act.
 */

export interface ContentResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  created?: number;
  itemId?: string;
}

function aiErrorMessage(error: unknown) {
  const retryable = error instanceof AIError ? error.retryable : false;

  return retryable
    ? "The AI provider did not respond. Nothing was created — try again."
    : "That request could not be completed. Nothing was created.";
}

export async function generateContentAction(
  projectId: string,
  input: {
    platform: PlatformKey;
    type: ContentTypeKey;
    count: number;
    objective?: string;
    guidance?: string;
  },
): Promise<ContentResult> {
  const project = await projectInWorkspace(projectId);
  if (!project) return { ok: false, message: "This project no longer exists." };

  // Bounded so a stray value cannot ask for a hundred pieces in one call.
  const count = Math.min(Math.max(Math.round(input.count) || 3, 1), 8);

  try {
    const output = await runAgent(museAgent, {
      projectId,
      payload: {
        platform: input.platform,
        type: input.type,
        count,
        objective: input.objective,
        guidance: input.guidance,
      },
    }, metering(project, FEATURES.content));

    await db.contentItem.createMany({
      data: output.result.items.map((item) => ({
        projectId,
        // The agent's own platform/type are ignored in favour of what was asked
        // for: a model that drifts to a different platform should not silently
        // file the result under it.
        platform: input.platform,
        type: input.type,
        status: "IDEA" as const,
        objective: item.objective,
        audience: item.audience,
        pillar: item.pillar,
        hook: item.hook,
        body: item.body,
        cta: item.cta,
        source: "AI" as const,
        agentRunId: output.runId,
      })),
    });

    logger.info("Content generated", {
      projectId,
      platform: input.platform,
      created: output.result.items.length,
    });

    revalidatePath("/content");
    return { ok: true, created: output.result.items.length };
  } catch (error) {
    logger.error("Content generation failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: aiErrorMessage(error) };
  }
}

export async function saveContentItemAction(
  projectId: string,
  input: ContentItemInput & { itemId?: string },
): Promise<ContentResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const parsed = contentItemSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  const data = {
    platform: parsed.data.platform,
    type: parsed.data.type,
    status: parsed.data.status,
    objective: parsed.data.objective,
    audience: parsed.data.audience,
    pillar: parsed.data.pillar,
    hook: parsed.data.hook,
    body: parsed.data.body,
    cta: parsed.data.cta,
    // A stored day (UTC midnight), so the calendar grid puts it on the cell the
    // operator picked — see src/lib/date.ts.
    scheduledAt: parseDayInput(parsed.data.scheduledAt),
  };

  try {
    if (input.itemId) {
      const updated = await db.contentItem.updateMany({
        where: { id: input.itemId, projectId },
        // Editing marks it as the operator's, so provenance stays honest.
        data: { ...data, source: "EDITED" },
      });

      if (updated.count === 0) return { ok: false, message: "That item no longer exists." };
      revalidatePath("/content");
      return { ok: true, itemId: input.itemId };
    }

    const created = await db.contentItem.create({
      data: { projectId, ...data, source: "MANUAL" },
    });

    revalidatePath("/content");
    return { ok: true, itemId: created.id };
  } catch (error) {
    logger.error("Content write failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "The item could not be saved." };
  }
}

/**
 * Move an item through the editorial lifecycle.
 *
 * PUBLISHED records that the operator published it elsewhere. LUMEN has no
 * publishing integration and this action does not send anything anywhere.
 */
export async function setContentStatusAction(
  projectId: string,
  itemId: string,
  status: ContentStatusKey,
): Promise<ContentResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  // A server action is a public HTTP endpoint: the TypeScript parameter type is
  // a compile-time promise, not a runtime one. An unrecognised value reached
  // Prisma and threw, turning a bad request into a 500.
  if (!contentStatusKeys.includes(status)) {
    return { ok: false, message: "That is not a valid status." };
  }

  const updated = await db.contentItem.updateMany({
    where: { id: itemId, projectId },
    data: { status },
  });

  if (updated.count === 0) return { ok: false, message: "That item does not exist." };

  revalidatePath("/content");
  return { ok: true, itemId };
}

export async function deleteContentItemAction(
  projectId: string,
  itemId: string,
): Promise<ContentResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const removed = await db.contentItem.deleteMany({ where: { id: itemId, projectId } });

  if (removed.count === 0) return { ok: false, message: "That item does not exist." };

  revalidatePath("/content");
  return { ok: true };
}

/**
 * Change or clear an item's planned date.
 *
 * Moving an item to a date automatically promotes an untouched IDEA to
 * SCHEDULED, because putting something on the calendar is what scheduling
 * means; anything already further along keeps its status.
 */
export async function setContentScheduleAction(
  projectId: string,
  itemId: string,
  isoDate: string | null,
): Promise<ContentResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const scheduledAt = parseDayInput(isoDate);

  if (isoDate && !scheduledAt) {
    return { ok: false, message: "Enter a valid date." };
  }

  const existing = await db.contentItem.findFirst({
    where: { id: itemId, projectId },
    select: { status: true },
  });

  if (!existing) return { ok: false, message: "That item does not exist." };

  const status =
    isoDate && existing.status === "IDEA"
      ? ("SCHEDULED" as const)
      : !isoDate && existing.status === "SCHEDULED"
        ? ("DRAFT" as const)
        : existing.status;

  await db.contentItem.updateMany({
    where: { id: itemId, projectId },
    data: { scheduledAt, status },
  });

  revalidatePath("/content");
  return { ok: true, itemId };
}

/**
 * Generate a dated content plan.
 *
 * The model returns slot numbers; the schedule is computed here from the range
 * and frequency the operator chose. Items land as DRAFT per the spec — they are
 * planned work, not published work, and not raw ideas either.
 */
export async function generateContentPlanAction(
  projectId: string,
  input: {
    goal: string;
    from: string;
    to: string;
    platforms: PlatformKey[];
    frequency: FrequencyKey;
    audience?: string;
    guidance?: string;
  },
): Promise<ContentResult> {
  const project = await projectInWorkspace(projectId);
  if (!project) return { ok: false, message: "This project no longer exists." };

  if (!input.goal?.trim()) return { ok: false, message: "Say what this plan is for." };
  if (input.platforms.length === 0) {
    return { ok: false, message: "Choose at least one platform." };
  }

  const from = parseDayInput(input.from);
  const to = parseDayInput(input.to);

  if (!from || !to) {
    return { ok: false, message: "Enter valid start and end dates." };
  }

  if (to < from) return { ok: false, message: "The end date is before the start date." };

  const schedule = buildSchedule(from, to, input.frequency);

  if (schedule.length === 0) {
    return { ok: false, message: "That range contains no posting days at this frequency." };
  }

  try {
    const output = await runAgent(contentPlanAgent, {
      projectId,
      payload: {
        goal: input.goal.trim(),
        platforms: input.platforms,
        slotCount: schedule.length,
        audience: input.audience,
        guidance: input.guidance,
        rangeDescription: `${from.toDateString()} to ${to.toDateString()}`,
      },
    }, metering(project, FEATURES.content));

    // Slots are clamped and de-duplicated: a model that returns slot 99, or two
    // items for slot 3, must not produce items with no date or a stolen one.
    const used = new Set<number>();
    const rows = output.result.items
      .map((item) => {
        let slot = Math.min(Math.max(item.slot, 0), schedule.length - 1);
        while (used.has(slot) && slot < schedule.length - 1) slot += 1;
        if (used.has(slot)) return null;
        used.add(slot);

        return {
          projectId,
          platform: input.platforms.includes(item.platform as PlatformKey)
            ? item.platform
            : input.platforms[0],
          type: item.type,
          status: "DRAFT" as const,
          objective: item.objective,
          audience: item.audience,
          pillar: item.pillar,
          hook: item.hook,
          body: item.body,
          cta: item.cta,
          scheduledAt: schedule[slot],
          source: "AI" as const,
          agentRunId: output.runId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    await db.contentItem.createMany({ data: rows });

    logger.info("Content plan generated", {
      projectId,
      created: rows.length,
      slots: schedule.length,
    });

    revalidatePath("/content");
    return { ok: true, created: rows.length };
  } catch (error) {
    logger.error("Content plan generation failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: aiErrorMessage(error) };
  }
}
