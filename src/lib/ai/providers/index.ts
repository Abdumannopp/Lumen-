import "server-only";

import { getServerEnv } from "@/lib/env";
import type { AIProvider } from "@/lib/ai/types";
import { AnthropicProvider } from "@/lib/ai/providers/anthropic";
import { GeminiProvider } from "@/lib/ai/providers/gemini";
import { GroqProvider } from "@/lib/ai/providers/groq";
import { OpenRouterProvider } from "@/lib/ai/providers/openrouter";
import { MockProvider } from "@/lib/ai/providers/mock";

/**
 * Provider resolution.
 *
 * The choice lives in server env, so swapping vendors is configuration rather
 * than a code change, and no client bundle can learn which provider — or which
 * key — is in use. Cached per process because construction reads secrets.
 *
 * Every agent, the runtime, the retries and the whole test suite are unchanged
 * by adding a provider: that is what the abstraction was for.
 */
let cached: AIProvider | undefined;

export function getProvider(): AIProvider {
  if (cached) return cached;

  const env = getServerEnv();

  switch (env.AI_PROVIDER) {
    case "anthropic":
      cached = new AnthropicProvider(
        env.ANTHROPIC_API_KEY as string,
        env.AI_MODEL ?? "claude-sonnet-5",
      );
      break;
    case "gemini":
      cached = new GeminiProvider(env.GOOGLE_API_KEY as string, env.AI_MODEL);
      break;
    case "groq":
      cached = new GroqProvider(env.GROQ_API_KEY as string, env.AI_MODEL);
      break;
    case "openrouter":
      cached = new OpenRouterProvider(env.OPENROUTER_API_KEY as string, env.AI_MODEL);
      break;
    default:
      cached = new MockProvider();
  }

  return cached;
}
