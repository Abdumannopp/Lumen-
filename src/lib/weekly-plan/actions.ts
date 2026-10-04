"use server";

import { generateWeeklyPlan } from "@/lib/weekly-plan/generate";
import type { PlanResult } from "@/lib/weekly-plan/generate";

/**
 * The plan generation Server Action.
 *
 * A thin wrapper on purpose. Everything it does lives in
 * `src/lib/weekly-plan/generate.ts`, which also accepts `providerOptions` —
 * scripted AI provider behaviour, used by the development-only failure route.
 * This wrapper exists so that argument is unreachable from a browser: a Server
 * Action's parameters are whatever the client sends.
 */
export async function generateWeeklyPlanAction(
  projectId: string,
  input: { guidance?: string } = {},
): Promise<PlanResult> {
  return generateWeeklyPlan(projectId, { guidance: input.guidance });
}
