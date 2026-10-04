import { z } from "zod";

import { handleRoute } from "@/lib/http";
import { errors } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import { requireProject } from "@/lib/auth/dal";
import { runAgent } from "@/lib/ai/runtime";
import { resetMockProvider } from "@/lib/ai/providers/mock";
import type { Agent } from "@/lib/ai/types";

/**
 * Diagnostic endpoint for the AI runtime.
 *
 * Exercises retries, timeouts, schema validation and run persistence end to end
 * over HTTP. Hard-gated to the mock provider: if a real provider is configured
 * this refuses, so the endpoint can never spend money or reach a vendor, and
 * shipping it enabled costs nothing.
 *
 * The mock gate is not the only check this needs. `runAgent` builds real
 * project context — `ProjectContextBuilder` does not ask whose project it is,
 * because every other caller reaches it only after a Server Action or query
 * module has already called `requireProject` — and the probe agent's mock
 * response echoes back the first 120 characters of that rendered context
 * verbatim (`src/lib/ai/providers/mock.ts`). Before `requireProject` was added
 * below, any unauthenticated caller could hand this route someone else's
 * `projectId` and read back the start of that project's real business-profile
 * and campaign data in the response body — confirmed against a running
 * server, not assumed. `requireProject` closes both problems the same way
 * every other route closes them: it is what turns "no session" into a 401
 * and "not your project" into the same not-found answer a guessed id gets
 * anywhere else in this product.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A throwaway agent whose only job is to exercise the runtime. */
const probeAgent: Agent<{ scenario: string }, { ok: boolean; echo: string; attempt: number }> = {
  type: "probe",
  contextSources: ["project", "businessProfile", "campaigns"],
  outputSchema: z.object({
    ok: z.boolean(),
    echo: z.string(),
    attempt: z.number(),
  }),
  system: "You are a diagnostic probe.",
  buildPrompt: (input) => `Scenario: ${input.payload.scenario}`,
  summarizeInput: (input) => `probe:${input.payload.scenario}`,
};

export async function POST(request: Request) {
  return handleRoute(async () => {
    const env = getServerEnv();

    if (env.AI_PROVIDER !== "mock" || env.APP_ENV !== "local") {
      throw errors.forbidden("The self-test only runs against the mock provider.");
    }

    const body = (await request.json()) as { projectId?: string; scenario?: string };

    if (!body.projectId) throw errors.badRequest("projectId is required.");

    // Not-found for a project the caller cannot see, same as everywhere else
    // that reads a caller-supplied projectId — see the note above on why a
    // second check is needed here even though this route already refuses
    // anything but the mock provider.
    await requireProject(body.projectId);

    const scenario = body.scenario ?? "ok";
    // Each call gets a fresh counter so "fail twice then succeed" is repeatable.
    resetMockProvider();

    const output = await runAgent(
      probeAgent,
      { projectId: body.projectId, payload: { scenario } },
      { providerOptions: { scenario, runKey: `${body.projectId}:${scenario}` } },
    );

    return {
      runId: output.runId,
      attempts: output.attempts,
      provider: output.provider,
      model: output.model,
      usage: output.usage,
      result: output.result,
    };
  });
}
