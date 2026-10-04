import "server-only";

import type { AIProvider, CompletionRequest, CompletionResponse } from "@/lib/ai/types";
import { AIError } from "@/lib/ai/errors";
import { clientEnv } from "@/lib/env";

/**
 * OpenRouter provider.
 *
 * OpenAI-compatible, so the request shape is the familiar one — but unlike the
 * other providers, "openrouter" is not one model, it is a router in front of
 * hundreds of them from dozens of vendors. `AI_MODEL` here is not optional
 * pinning, it is the actual choice of model; the default below is a free,
 * no-card option so the provider works the moment a key is added, the same
 * reasoning Gemini and Groq get their defaults for.
 *
 * `response_format: { type: "json_object" }` is deliberately NOT sent. Groq and
 * Gemini can force it because each is a single, known backend; OpenRouter's
 * whole point is that the backend behind any given model id can vary, and
 * OpenRouter's own documentation is explicit that structured-output support
 * "depends on individual model support" rather than being universal. Forcing
 * it would turn a swappable-model provider into one that silently 400s on
 * whichever models don't support it. The system prompt's own JSON instruction
 * (see `jsonInstruction()`) and the salvage-then-validate parser in
 * `structured-output.ts` are what Anthropic relies on too, and they are enough.
 */
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class OpenRouterProvider implements AIProvider {
  readonly id = "openrouter";
  readonly defaultModel: string;

  readonly #apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.#apiKey = apiKey;
    // A free-tier model so the provider is usable the moment a key is added,
    // with no spend required to see real output. Free OpenRouter models carry
    // their own low daily/per-minute cap — fine for trying LUMEN, and anyone
    // who outgrows it sets AI_MODEL to a paid one on the same key.
    this.defaultModel = model ?? "openai/gpt-oss-120b:free";
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    let response: Response;

    try {
      response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.#apiKey}`,
          // Recommended, not required, by OpenRouter: identifies the calling
          // app for its own leaderboards and rate-limit attribution. Neither
          // header is a secret.
          "http-referer": clientEnv.NEXT_PUBLIC_APP_URL,
          "x-title": "Lumen",
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          messages: [
            { role: "system", content: request.system },
            ...request.messages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          ],
        }),
        signal: request.signal,
      });
    } catch (error) {
      throw new AIError("Could not reach OpenRouter.", {
        retryable: true,
        provider: this.id,
        cause: error,
      });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const retryable = response.status === 429 || response.status >= 500;

      throw new AIError(
        response.status === 429
          ? "OpenRouter's rate limit was reached. Wait a moment and try again."
          : `OpenRouter returned ${response.status}.${detail ? ` ${detail.slice(0, 200)}` : ""}`,
        { retryable, provider: this.id },
      );
    }

    const payload = (await response.json()) as OpenRouterResponse;
    const text = payload.choices?.[0]?.message?.content?.trim() ?? "";

    if (!text) {
      throw new AIError("OpenRouter returned an empty response.", {
        retryable: true,
        provider: this.id,
      });
    }

    return {
      text,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? null,
        completionTokens: payload.usage?.completion_tokens ?? null,
      },
      model: payload.model ?? model,
    };
  }
}
