import "server-only";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getServerEnv } from "@/lib/env";
import { getProvider } from "@/lib/ai/providers";
import { AIError, AITimeoutError } from "@/lib/ai/errors";
import { jsonInstruction, parseStructuredOutput } from "@/lib/ai/structured-output";
import { ProjectContextBuilder, countIncluded, renderAgentContext } from "@/lib/ai/context-builder";
import type { Agent, AgentInput, AgentOutput } from "@/lib/ai/types";
import { estimateCost } from "@/lib/usage/pricing";
import { claimRun, refundRun } from "@/lib/usage/quota";
import { FAILED_RUNS_COUNT_AGAINST_QUOTA } from "@/config/usage";

/**
 * Agent runtime.
 *
 * Owns everything an agent should not have to think about: gathering context,
 * calling the provider, enforcing a per-attempt timeout, retrying transient
 * failures with bounded backoff, validating the response against the agent's
 * schema, and recording the run. Agents stay declarative; reliability lives
 * here, once, so it cannot drift between them.
 *
 * A run row is written *before* the first attempt and updated on settle, so a
 * process that dies mid-call leaves a RUNNING row behind rather than losing the
 * evidence that anything happened.
 *
 * Two things happen here and nowhere else, because "nowhere else" is what makes
 * them guarantees rather than conventions:
 *
 * **The allowance is claimed before the provider is called.** Every AI feature
 * in the product goes through this function, so there is no second path that
 * could reach a vendor without being counted. A workspace over its limit gets a
 * QuotaExceededError and the provider is never contacted.
 *
 * **The cost is computed from what the provider reported.** Not estimated from
 * the prompt, not assumed from the model tier — from the token counts that came
 * back, priced against src/lib/usage/pricing.ts.
 */

/** Exponential backoff, capped, with jitter to avoid synchronised retries. */
function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = Math.min(baseMs * 2 ** (attempt - 1), maxMs);
  return Math.round(exponential * (0.5 + Math.random() * 0.5));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Race a promise against a timeout, aborting the underlying request.
 *
 * The abort matters: without it a slow provider call would keep running after
 * the timeout, holding a connection and eventually resolving into nothing.
 */
async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  provider: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AITimeoutError(provider, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export interface RunAgentOptions {
  /** Forwarded to the provider. The mock uses it to script scenarios. */
  providerOptions?: Record<string, unknown>;
  /**
   * Who this runs for, and what asked.
   *
   * Optional in the type and required in practice: without a workspace there is
   * nothing to charge and nothing to limit, so a run without one is allowed
   * through unmetered. The one caller that legitimately has no workspace is the
   * diagnostic self-test, which is gated to the mock provider and therefore
   * cannot cost anything.
   */
  workspaceId?: string;
  userId?: string;
  featureKey?: string;
  /**
   * Makes a repeated request return the first run instead of starting a second.
   *
   * Unique in the database, so the duplicate is refused there rather than by
   * this function remembering to check — which is the difference between a
   * guarantee and a habit.
   */
  idempotencyKey?: string;
  promptVersion?: string;
  schemaVersion?: string;
}

/** Thrown when `idempotencyKey` matches a run that already happened. */
export class DuplicateRunError extends Error {
  readonly runId: string;

  constructor(runId: string) {
    super("That request has already been made.");
    this.name = "DuplicateRunError";
    this.runId = runId;
  }
}

export async function runAgent<TPayload, TResult>(
  agent: Agent<TPayload, TResult>,
  input: AgentInput<TPayload>,
  options: RunAgentOptions = {},
): Promise<AgentOutput<TResult>> {
  const env = getServerEnv();
  const provider = getProvider();
  const model = agent.model ?? provider.defaultModel;

  const startedAt = Date.now();

  // Before anything else, and before any money can be spent. A duplicate is
  // caught here rather than after the call, so a double-clicked button costs
  // nothing at all.
  if (options.idempotencyKey) {
    const existing = await db.agentRun.findUnique({
      where: { idempotencyKey: options.idempotencyKey },
      select: { id: true },
    });

    if (existing) throw new DuplicateRunError(existing.id);
  }

  // Claimed before the provider is reached. Throws QuotaExceededError, which
  // callers report as "you are out of allowance" rather than as a failure.
  if (options.workspaceId) await claimRun(options.workspaceId);

  // Context is gathered once and reused across attempts: a retry is the same
  // question asked again, not a different one.
  //
  // A failure here happens before the provider is reached, so the claim goes
  // back: nothing was spent, and an allowance that shrinks when *our* database
  // has a bad moment is an allowance the operator cannot reason about.
  let context;

  try {
    context = await new ProjectContextBuilder(input.projectId)
      .include(...agent.contextSources)
      .build();
  } catch (error) {
    if (options.workspaceId) await refundRun(options.workspaceId);
    throw error;
  }

  let run: { id: string };

  try {
    run = await db.agentRun.create({
      data: {
        projectId: input.projectId,
        workspaceId: options.workspaceId ?? null,
        userId: options.userId ?? null,
        featureKey: options.featureKey ?? null,
        idempotencyKey: options.idempotencyKey ?? null,
        promptVersion: options.promptVersion ?? null,
        schemaVersion: options.schemaVersion ?? null,
        agentType: agent.type,
        inputSummary: agent.summarizeInput(input).slice(0, 500),
        provider: provider.id,
        model,
        status: "RUNNING",
      },
      select: { id: true },
    });
  } catch (error) {
    // The unique index on idempotencyKey caught a request that raced past the
    // check above. Nothing was spent, so the claim goes back.
    if (options.workspaceId) await refundRun(options.workspaceId);
    throw error;
  }

  const system = `${agent.system}\n\n${jsonInstruction()}`;
  const prompt = `${renderAgentContext(context)}\n\n${agent.buildPrompt(input, context)}`;

  let lastError: unknown;
  let attempts = 0;

  for (let attempt = 1; attempt <= env.AI_MAX_ATTEMPTS; attempt += 1) {
    attempts = attempt;

    try {
      const response = await withTimeout(
        (signal) =>
          provider.complete({
            system,
            messages: [{ role: "user", content: prompt }],
            model,
            maxTokens: agent.maxTokens ?? 2048,
            temperature: agent.temperature ?? 0.4,
            signal,
            providerOptions: options.providerOptions,
          }),
        env.AI_TIMEOUT_MS,
        provider.id,
      );

      const { result } = parseStructuredOutput(response.text, agent.outputSchema, provider.id);
      const latencyMs = Date.now() - startedAt;
      const cost = estimateCost(
        response.model,
        response.usage.promptTokens,
        response.usage.completionTokens,
      );

      await db.agentRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          output: result as never,
          completedAt: new Date(),
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          // Null rather than zero when the model has no published rate — see
          // `estimateCost`. A wrong number costs more trust than a missing one.
          estimatedCostUsd: cost.known ? cost.usd : null,
          latencyMs,
          attempts,
        },
      });

      logger.info("Agent run succeeded", {
        runId: run.id,
        agentType: agent.type,
        provider: provider.id,
        model,
        attempts,
        latencyMs,
        contextSlices: countIncluded(context),
      });

      return {
        runId: run.id,
        result,
        provider: provider.id,
        model: response.model,
        usage: response.usage,
        latencyMs,
        attempts,
      };
    } catch (error) {
      lastError = error;

      const retryable = error instanceof AIError ? error.retryable : false;
      const hasAttemptsLeft = attempt < env.AI_MAX_ATTEMPTS;

      logger.warn("Agent attempt failed", {
        runId: run.id,
        agentType: agent.type,
        attempt,
        retryable,
        message: error instanceof Error ? error.message : String(error),
      });

      // A non-retryable failure means the request itself is wrong. Trying it
      // again just spends the budget repeating a known-bad call.
      if (!retryable || !hasAttemptsLeft) break;

      await sleep(backoffDelay(attempt, env.AI_RETRY_BASE_MS, env.AI_RETRY_MAX_MS));
    }
  }

  const latencyMs = Date.now() - startedAt;
  const timedOut = lastError instanceof AITimeoutError;
  const message = lastError instanceof Error ? lastError.message : String(lastError);

  /**
   * Whether this failure spent the allowance.
   *
   * `attempts` is zero only if the loop never ran, which means the provider was
   * never contacted and nothing was billed. Any other failure did reach the
   * vendor: the tokens were generated and charged whatever came back, so the
   * run counts — see FAILED_RUNS_COUNT_AGAINST_QUOTA in src/config/usage.ts,
   * where that decision is stated rather than implied.
   */
  const reachedProvider = attempts > 0;

  if (options.workspaceId && !(reachedProvider && FAILED_RUNS_COUNT_AGAINST_QUOTA)) {
    await refundRun(options.workspaceId);
  }

  await db.agentRun.update({
    where: { id: run.id },
    data: {
      status: timedOut ? "TIMED_OUT" : "FAILED",
      completedAt: new Date(),
      errorMessage: message.slice(0, 1000),
      latencyMs,
      attempts,
      /**
       * Released, so the same request can be made again.
       *
       * The key exists to stop one intention becoming two runs — a double
       * click, a retried POST. It is not a record that the question was asked
       * and may never be asked again. Left in place on a failure it would
       * permanently block the one thing the person will certainly do next,
       * which is try again.
       *
       * The row itself stays, with its status, its error and its cost. What is
       * given up is only the claim on the key.
       */
      idempotencyKey: null,
    },
  });

  logger.error("Agent run failed", {
    runId: run.id,
    agentType: agent.type,
    attempts,
    latencyMs,
    message,
  });

  throw lastError instanceof AIError
    ? lastError
    : new AIError(message, { retryable: false, provider: provider.id, cause: lastError });
}
