"use server";

import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { runAgent } from "@/lib/ai/runtime";
import { metering } from "@/lib/usage/metering";
import { FEATURES } from "@/config/usage";
import { projectInWorkspace } from "@/lib/auth/dal";
import { AIError } from "@/lib/ai/errors";
import { AGENT_REGISTRY, routerAgent, type AgentKey } from "@/lib/assistant/router";
import { generateStrategyAction } from "@/lib/strategy/actions";
import { generateAudienceAction } from "@/lib/audience/actions";
import { generateInsightsAction } from "@/lib/intelligence/actions";
import { generateContentAction } from "@/lib/content/actions";
import { planCampaignAction } from "@/lib/campaigns/actions";
import { generateRecommendationsAction } from "@/lib/growth/actions";

/**
 * Routing and execution.
 *
 * Split deliberately into two actions. `routeRequestAction` only decides; it
 * writes nothing. `runRouteAction` executes, and is called after the operator
 * has seen what will be created. A chat message should never silently produce a
 * strategy version or a campaign.
 */

export interface RouteStep {
  agent: AgentKey;
  reason: string;
  label: string;
  writes: boolean;
  creates: string;
}

export interface RouteResult {
  ok: boolean;
  message?: string;
  understanding?: string;
  steps?: RouteStep[];
  /** True when running the route would create records. */
  writes?: boolean;
}

export interface RunStepOutcome {
  agent: AgentKey;
  label: string;
  ok: boolean;
  detail: string;
  href?: string;
}

export interface RunRouteResult {
  ok: boolean;
  message?: string;
  outcomes?: RunStepOutcome[];
}

function aiErrorMessage(error: unknown) {
  const retryable = error instanceof AIError ? error.retryable : false;

  return retryable
    ? "The AI provider did not respond. Nothing was changed — try again."
    : "That request could not be completed. Nothing was changed.";
}

export async function routeRequestAction(
  projectId: string,
  request: string,
): Promise<RouteResult> {
  const trimmed = request.trim();

  if (trimmed.length < 2) return { ok: false, message: "Type a request first." };
  if (trimmed.length > 2000) return { ok: false, message: "That request is too long." };

  // Ownership before anything else: `projectId` arrives from the browser. This
  // file was missed by the workspace sweep because it is named route-actions.ts
  // rather than actions.ts — which is exactly why the check belongs in every
  // action rather than in a pattern applied to a filename.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  try {
    const output = await runAgent(
      routerAgent,
      { projectId, payload: { request: trimmed } },
      metering(owned, FEATURES.assistant),
    );

    const steps: RouteStep[] = output.result.steps.map((step) => ({
      agent: step.agent,
      reason: step.reason,
      label: AGENT_REGISTRY[step.agent].label,
      writes: AGENT_REGISTRY[step.agent].writes,
      creates: AGENT_REGISTRY[step.agent].creates,
    }));

    logger.info("Request routed", {
      projectId,
      steps: steps.map((step) => step.agent),
    });

    return {
      ok: true,
      understanding: output.result.understanding,
      steps,
      writes: steps.some((step) => step.writes),
    };
  } catch (error) {
    logger.error("Routing failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: aiErrorMessage(error) };
  }
}

/**
 * Execute a route, in order, stopping at the first failure.
 *
 * Stopping matters: the steps are ordered because each depends on the last, so
 * continuing past a failed audience generation would produce a strategy built on
 * nothing. What did succeed is kept and reported.
 */
export async function runRouteAction(
  projectId: string,
  agents: AgentKey[],
  request: string,
): Promise<RunRouteResult> {
  if (agents.length === 0) return { ok: false, message: "Nothing to run." };
  if (agents.length > 4) return { ok: false, message: "That route is too long to run." };

  // A server action is a public HTTP endpoint, so the AgentKey[] parameter type
  // guarantees nothing at runtime. An unrecognised name indexed AGENT_REGISTRY
  // to undefined and threw before the loop's try block could catch it, turning a
  // bad request into a 500.
  if (agents.some((agent) => !(agent in AGENT_REGISTRY))) {
    return { ok: false, message: "That route names an agent that does not exist." };
  }

  // Ownership before anything else: `projectId` arrives from the browser. This
  // file was missed by the workspace sweep because it is named route-actions.ts
  // rather than actions.ts — which is exactly why the check belongs in every
  // action rather than in a pattern applied to a filename.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const outcomes: RunStepOutcome[] = [];

  for (const agent of agents) {
    const label = AGENT_REGISTRY[agent].label;

    try {
      if (agent === "ATLAS") {
        const result = await generateStrategyAction(projectId, request);
        outcomes.push({
          agent,
          label,
          ok: result.ok,
          detail: result.ok ? "New strategy version created." : (result.message ?? "Failed."),
          href: "/strategy",
        });
        if (!result.ok) break;
      } else if (agent === "PULSE") {
        const result = await generateAudienceAction(projectId, request);
        outcomes.push({
          agent,
          label,
          ok: result.ok,
          detail: result.ok ? "Audience segments updated." : (result.message ?? "Failed."),
          href: "/audience",
        });
        if (!result.ok) break;
      } else if (agent === "SCOUT") {
        const result = await generateInsightsAction(projectId, request);
        outcomes.push({
          agent,
          label,
          ok: result.ok,
          detail: result.ok ? "Market insights updated." : (result.message ?? "Failed."),
          href: "/intelligence",
        });
        if (!result.ok) break;
      } else if (agent === "MUSE") {
        const result = await generateContentAction(projectId, {
          platform: "LINKEDIN",
          type: "POST",
          count: 3,
          guidance: request,
        });
        outcomes.push({
          agent,
          label,
          ok: result.ok,
          detail: result.ok
            ? `${result.created ?? 0} draft items created. Adjust platform and format on the content page.`
            : (result.message ?? "Failed."),
          href: "/content",
        });
        if (!result.ok) break;
      } else if (agent === "ORBIT") {
        const result = await planCampaignAction(projectId, { brief: request });
        outcomes.push({
          agent,
          label,
          ok: result.ok,
          detail: result.ok ? "Campaign plan created as a draft." : (result.message ?? "Failed."),
          href: "/campaigns",
        });
        if (!result.ok) break;
      } else if (agent === "ASCEND") {
        const result = await generateRecommendationsAction(projectId, request);
        outcomes.push({
          agent,
          label,
          ok: result.ok,
          detail: result.ok
            ? `${result.created ?? 0} recommendations created.`
            : (result.message ?? "Failed."),
          href: "/growth",
        });
        if (!result.ok) break;
      } else {
        // ASSISTANT is answered in the conversation, not run as a step.
        outcomes.push({
          agent,
          label,
          ok: true,
          detail: "Answered in the conversation.",
        });
      }
    } catch (error) {
      logger.error("Route step failed", {
        projectId,
        agent,
        message: error instanceof Error ? error.message : String(error),
      });
      outcomes.push({ agent, label, ok: false, detail: aiErrorMessage(error) });
      break;
    }
  }

  revalidatePath("/", "layout");

  const failed = outcomes.find((outcome) => !outcome.ok);

  return {
    ok: !failed,
    message: failed ? `${failed.label} could not finish, so the rest was not run.` : undefined,
    outcomes,
  };
}
