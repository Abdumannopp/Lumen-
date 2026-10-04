"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { projectInWorkspace } from "@/lib/auth/dal";
import { logger } from "@/lib/logger";
import { runAgent } from "@/lib/ai/runtime";
import { metering } from "@/lib/usage/metering";
import { FEATURES } from "@/config/usage";
import { AIError } from "@/lib/ai/errors";
import {
  balanceLines,
  budgetAgent,
  budgetPlanSchema,
  suggestionToLines,
  type BudgetLine,
  type BudgetPlanInput,
} from "@/lib/budget/agent";

/**
 * Budget writes.
 *
 * Every path through this file ends in `balanceLines()`, so the invariant the
 * spec requires — allocation equals total — holds for AI suggestions, manual
 * entry and edits alike. It is enforced here rather than in the form, because a
 * client-side check is a courtesy and a server-side one is a guarantee.
 */

export interface BudgetResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  planId?: string;
  lines?: BudgetLine[];
  assumptions?: string[];
  missingInformation?: string[];
}

function aiErrorMessage(error: unknown) {
  const retryable = error instanceof AIError ? error.retryable : false;

  return retryable
    ? "The AI provider did not respond. Nothing was changed — try again."
    : "That request could not be completed. Nothing was changed.";
}

/**
 * Ask for a suggested allocation.
 *
 * Returns lines without saving: a suggestion is a proposal the operator adjusts
 * before committing, and writing it straight to the database would make
 * "suggest" indistinguishable from "decide".
 */
export async function suggestBudgetAction(
  projectId: string,
  input: { total: number; currency: string; goal: string; categories: string[]; guidance?: string },
): Promise<BudgetResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const total = Math.max(0, Math.round(input.total));

  if (total <= 0) return { ok: false, message: "Enter a budget greater than zero." };
  if (input.categories.length === 0) {
    return { ok: false, message: "Choose at least one category to allocate across." };
  }

  try {
    const output = await runAgent(budgetAgent, {
      projectId,
      payload: {
        total,
        currency: input.currency,
        goal: input.goal,
        availableCategories: input.categories,
        guidance: input.guidance,
      },
    }, metering(owned, FEATURES.budget));

    // Categories the operator excluded are dropped before balancing, so the
    // suggestion cannot spend on something they ruled out.
    const allowed = output.result.lines.filter((line) =>
      input.categories.includes(line.category),
    );

    if (allowed.length === 0) {
      return { ok: false, message: "The suggestion did not fit the categories you chose." };
    }

    return {
      ok: true,
      lines: suggestionToLines({ ...output.result, lines: allowed }, total),
      assumptions: output.result.assumptions,
      missingInformation: output.result.missingInformation,
    };
  } catch (error) {
    logger.error("Budget suggestion failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: aiErrorMessage(error) };
  }
}

export async function saveBudgetPlanAction(
  projectId: string,
  input: BudgetPlanInput & { planId?: string; source?: "AI" | "MANUAL" },
): Promise<BudgetResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const parsed = budgetPlanSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  const allocated = parsed.data.lines.reduce((running, line) => running + line.amount, 0);

  if (allocated === 0) {
    return { ok: false, message: "Allocate the budget across at least one category." };
  }

  // The rebalance is silent only because it is arithmetic: proportions are
  // preserved exactly, and the operator is told the total in the UI before saving.
  const lines = balanceLines(parsed.data.lines, parsed.data.total);

  const data = {
    name: parsed.data.name,
    total: parsed.data.total,
    currency: parsed.data.currency,
    period: parsed.data.period,
    goal: parsed.data.goal,
    lines: lines as never,
  };

  try {
    if (input.planId) {
      const updated = await db.budgetPlan.updateMany({
        where: { id: input.planId, projectId },
        data: { ...data, source: "EDITED" },
      });

      if (updated.count === 0) return { ok: false, message: "That plan no longer exists." };

      revalidatePath("/budget");
      return { ok: true, planId: input.planId, lines };
    }

    const created = await db.budgetPlan.create({
      data: { projectId, ...data, source: input.source === "AI" ? "AI" : "MANUAL" },
      select: { id: true },
    });

    logger.info("Budget plan saved", { projectId, planId: created.id, total: parsed.data.total });

    revalidatePath("/budget");
    return { ok: true, planId: created.id, lines };
  } catch (error) {
    logger.error("Budget plan write failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "The plan could not be saved." };
  }
}

export async function deleteBudgetPlanAction(
  projectId: string,
  planId: string,
): Promise<BudgetResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const removed = await db.budgetPlan.deleteMany({ where: { id: planId, projectId } });

  if (removed.count === 0) return { ok: false, message: "That plan does not exist." };

  revalidatePath("/budget");
  return { ok: true };
}
