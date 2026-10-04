import { NextResponse, type NextRequest } from "next/server";

import { getServerEnv } from "@/lib/env";
import { resetMockProvider } from "@/lib/ai/providers/mock";
import { generateWeeklyPlan } from "@/lib/weekly-plan/generate";

/**
 * Generate a plan with the AI provider scripted to misbehave.
 *
 * The brief requires that a failed or malformed generation leaves no partial
 * plan behind. That is only worth asserting against the code that actually
 * runs, so this route calls the same `generateWeeklyPlan` the Server Action
 * calls, with the same transaction and the same guardrails — the one difference
 * is that it passes `providerOptions`, telling the mock provider to return
 * prose instead of JSON, or the wrong shape, or to throw.
 *
 * Guarded twice over, because "development only" written in a comment is not a
 * guard:
 *
 *   this route 404s unless `AI_PROVIDER=mock` **and** `APP_ENV` (a plain
 *   server variable, resolved at process start — never `NEXT_PUBLIC_APP_ENV`,
 *   which Next.js would freeze at whatever it was during `npm run build`) is
 *   not "production"
 *
 *   authorisation is unchanged — `generateWeeklyPlan` starts at the Data Access
 *   Layer, so this cannot reach a project the caller does not own
 *
 * With any real provider it is inert, and there is no provider to script.
 */
export async function POST(request: NextRequest) {
  const env = getServerEnv();

  if (env.AI_PROVIDER !== "mock" || env.APP_ENV !== "local") {
    return new NextResponse("Not found", { status: 404 });
  }

  const body = (await request.json()) as { projectId?: string; scenario?: string };

  if (!body.projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  // Each call gets a fresh counter, so "fail twice then succeed" is repeatable.
  resetMockProvider();

  const result = await generateWeeklyPlan(body.projectId, {
    providerOptions: { scenario: body.scenario ?? "ok", runKey: `plan-scenario:${body.scenario}` },
  });

  return NextResponse.json(result);
}
