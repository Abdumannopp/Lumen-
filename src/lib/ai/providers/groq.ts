import "server-only";

import type { AIProvider, CompletionRequest, CompletionResponse } from "@/lib/ai/types";
import { AIError } from "@/lib/ai/errors";

/**
 * Groq provider.
 *
 * OpenAI-compatible, so the request shape is the familiar one. Groq's appeal is
 * speed — responses arrive in a fraction of the time — with a smaller daily
 * allowance than Gemini, which makes it a good second option rather than a
 * first.
 *
 * JSON mode is requested for the same reason as Gemini: constraining the model
 * to parseable output is more reliable than asking for it in the prompt.
 */
const API_URL = "https://api.groq.com/openai/v1/chat/completions";

interface GroqResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export class GroqProvider implements AIProvider {
  readonly id = "groq";
  readonly defaultModel: string;

  readonly #apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.#apiKey = apiKey;
    // Groq's current general-purpose production model. The previous default,
    // `llama-3.3-70b-versatile`, was decommissioned on 16 August 2026, which
    // left anyone selecting Groq without an explicit AI_MODEL calling a model
    // that no longer exists. Groq names this as its replacement.
    this.defaultModel = model ?? "openai/gpt-oss-120b";
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
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          response_format: { type: "json_object" },
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
      throw new AIError("Could not reach Groq.", {
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
          ? "Groq's free-tier rate limit was reached. Wait a moment and try again."
          : `Groq returned ${response.status}.${detail ? ` ${detail.slice(0, 200)}` : ""}`,
        { retryable, provider: this.id },
      );
    }

    const payload = (await response.json()) as GroqResponse;
    const text = payload.choices?.[0]?.message?.content?.trim() ?? "";

    if (!text) {
      throw new AIError("Groq returned an empty response.", {
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
