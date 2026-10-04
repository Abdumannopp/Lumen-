import { AppError } from "@/lib/errors";

/**
 * AI failures, split by whether retrying could plausibly help.
 *
 * The runtime branches on `retryable` alone, so adding a new failure mode means
 * deciding that one question rather than editing the retry loop.
 */
export class AIError extends AppError {
  readonly retryable: boolean;
  readonly provider: string;

  constructor(
    message: string,
    options: { retryable: boolean; provider: string; cause?: unknown },
  ) {
    super(options.retryable ? "SERVICE_UNAVAILABLE" : "INTERNAL", message, {
      cause: options.cause,
    });
    this.name = "AIError";
    this.retryable = options.retryable;
    this.provider = options.provider;
  }
}

/** The provider did not answer within the per-attempt timeout. */
export class AITimeoutError extends AIError {
  constructor(provider: string, timeoutMs: number) {
    super(`The AI provider did not respond within ${timeoutMs}ms.`, {
      retryable: true,
      provider,
    });
    this.name = "AITimeoutError";
  }
}

/**
 * The response was not usable as structured output — malformed JSON, or JSON
 * that did not match the agent's schema. Retryable, because model output is
 * non-deterministic and a second attempt often parses cleanly.
 */
export class AIOutputError extends AIError {
  readonly raw: string;

  constructor(message: string, provider: string, raw: string) {
    super(message, { retryable: true, provider });
    this.name = "AIOutputError";
    this.raw = raw;
  }
}
