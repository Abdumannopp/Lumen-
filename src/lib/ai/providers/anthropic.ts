import "server-only";

import type {
  AIProvider,
  CompletionRequest,
  CompletionResponse,
} from "@/lib/ai/types";
import { AIError } from "@/lib/ai/errors";

/**
 * Anthropic Messages API provider.
 *
 * Uses fetch rather than the SDK so the dependency surface stays small and the
 * provider contract stays the thing that matters. The API key is read from
 * server env at construction and never leaves this module.
 *
 * Status handling is what makes retries meaningful: 429 and 5xx are transient,
 * 4xx are the caller's fault and must not be retried, because retrying a
 * malformed request just spends the budget four times.
 */
const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  readonly defaultModel: string;

  readonly #apiKey: string;

  constructor(apiKey: string, defaultModel: string) {
    this.#apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    let response: Response;

    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.#apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          system: request.system,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
        signal: request.signal,
      });
    } catch (error) {
      // Network-level failure, or the runtime aborted us. Both are transient.
      throw new AIError("Could not reach the AI provider.", {
        retryable: true,
        provider: this.id,
        cause: error,
      });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const retryable = response.status === 429 || response.status >= 500;

      throw new AIError(
        `AI provider returned ${response.status}.${detail ? ` ${detail.slice(0, 200)}` : ""}`,
        { retryable, provider: this.id },
      );
    }

    const payload = (await response.json()) as AnthropicResponse;

    const text = (payload.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("\n")
      .trim();

    if (!text) {
      throw new AIError("AI provider returned an empty response.", {
        retryable: true,
        provider: this.id,
      });
    }

    return {
      text,
      usage: {
        promptTokens: payload.usage?.input_tokens ?? null,
        completionTokens: payload.usage?.output_tokens ?? null,
      },
      model: payload.model ?? request.model,
    };
  }
}
