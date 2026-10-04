import type { z } from "zod";

import { AIOutputError } from "@/lib/ai/errors";
import type { StructuredOutput } from "@/lib/ai/types";

/**
 * Structured output parsing.
 *
 * Models wrap JSON in prose or fences more often than they should, so the text
 * is salvaged before it is parsed rather than rejected on first inspection.
 * Both failure modes — unparseable text, and JSON of the wrong shape — raise
 * AIOutputError, which the runtime treats as retryable: model output is
 * non-deterministic and a second attempt frequently parses cleanly.
 */

/** Strip fences and return the outermost JSON object or array, if any. */
function extractJson(text: string): string | null {
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();

  if (candidate.startsWith("{") || candidate.startsWith("[")) return candidate;

  // Fall back to the first balanced-looking span, for prose-wrapped answers.
  const firstBrace = candidate.search(/[[{]/);
  if (firstBrace === -1) return null;

  const opener = candidate[firstBrace];
  const closer = opener === "{" ? "}" : "]";
  const lastCloser = candidate.lastIndexOf(closer);

  if (lastCloser <= firstBrace) return null;

  return candidate.slice(firstBrace, lastCloser + 1);
}

export function parseStructuredOutput<TResult>(
  text: string,
  schema: z.ZodType<TResult>,
  provider: string,
): StructuredOutput<TResult> {
  const json = extractJson(text);

  if (!json) {
    throw new AIOutputError("The model did not return JSON.", provider, text);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new AIOutputError("The model returned malformed JSON.", provider, text);
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    const detail = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");

    throw new AIOutputError(
      `The model's JSON did not match the expected shape. ${detail}`,
      provider,
      text,
    );
  }

  return { result: result.data, raw: text };
}

/**
 * Appended to every system prompt so the instruction to return JSON lives in
 * one place rather than being restated, differently, by each agent.
 */
export function jsonInstruction(): string {
  return [
    "Respond with a single JSON object and nothing else.",
    "Do not wrap it in markdown fences, and do not add commentary before or after it.",
    "If you are unsure about a value, use null rather than inventing one.",
  ].join(" ");
}
