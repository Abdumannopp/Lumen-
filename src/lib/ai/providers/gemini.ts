import "server-only";

import type { AIProvider, CompletionRequest, CompletionResponse } from "@/lib/ai/types";
import { AIError } from "@/lib/ai/errors";

/**
 * Google Gemini provider.
 *
 * Chosen as the recommended free option: no card required, and a daily request
 * allowance large enough to actually use LUMEN rather than just demo it.
 *
 * Gemini's own JSON mode is switched on, which is a real reliability win — the
 * model is constrained to emit parseable JSON rather than being asked politely
 * in the system prompt. The structured-output parser still validates the shape,
 * because valid JSON of the wrong shape is still wrong.
 *
 * Note for the operator: on Google's free tier, prompts may be used to improve
 * their products. That is a privacy trade-off, not a technical one, and the
 * settings page says so.
 */
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string; status?: string };
}

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  readonly defaultModel: string;

  readonly #apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.#apiKey = apiKey;
    // Flash is the free tier's workhorse: the widest daily allowance and easily
    // strong enough for the structured work LUMEN asks for.
    this.defaultModel = model ?? "gemini-2.5-flash";
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = request.model || this.defaultModel;
    let response: Response;

    try {
      response = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Header rather than a query parameter, so the key cannot end up in
          // a proxy log or an error URL.
          "x-goog-api-key": this.#apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: request.messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: {
            maxOutputTokens: request.maxTokens,
            temperature: request.temperature,
            responseMimeType: "application/json",
          },
        }),
        signal: request.signal,
      });
    } catch (error) {
      throw new AIError("Could not reach Google Gemini.", {
        retryable: true,
        provider: this.id,
        cause: error,
      });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // 429 is the free tier's daily or per-minute cap — transient by nature.
      const retryable = response.status === 429 || response.status >= 500;

      throw new AIError(
        response.status === 429
          ? "Gemini's free-tier rate limit was reached. It resets shortly — try again in a minute."
          : `Gemini returned ${response.status}.${detail ? ` ${detail.slice(0, 200)}` : ""}`,
        { retryable, provider: this.id },
      );
    }

    const payload = (await response.json()) as GeminiResponse;

    const text = (payload.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      // Usually a safety filter or a truncated response; both are worth retrying.
      throw new AIError(
        `Gemini returned no text${
          payload.candidates?.[0]?.finishReason
            ? ` (finish reason: ${payload.candidates[0].finishReason})`
            : ""
        }.`,
        { retryable: true, provider: this.id },
      );
    }

    return {
      text,
      usage: {
        promptTokens: payload.usageMetadata?.promptTokenCount ?? null,
        completionTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
      },
      model,
    };
  }
}
