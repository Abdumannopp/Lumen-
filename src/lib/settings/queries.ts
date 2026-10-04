import "server-only";

import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";
import { getServerEnv } from "@/lib/env";
import { getProvider } from "@/lib/ai/providers";

/**
 * Settings reads.
 *
 * Both the preferences and the row counts belong to one workspace. The counts
 * especially: "what is in here" answered across the whole install would tell
 * every tenant how much data every other tenant holds.
 */

export interface SettingsRecord {
  defaultProjectId: string | null;
  currency: string;
  timezone: string;
  locale: string;
  theme: string;
}

const DEFAULTS: SettingsRecord = {
  defaultProjectId: null,
  currency: "USD",
  timezone: "UTC",
  locale: "en-US",
  theme: "light",
};

/**
 * This workspace's preferences, falling back to defaults before first write.
 *
 * No row exists until someone saves, which is why the defaults live in code
 * rather than being seeded: a workspace that has never opened Settings should
 * behave exactly like one that saved the defaults, and a seed is a second place
 * for those two to drift apart.
 */
export async function getSettings(): Promise<SettingsRecord> {
  const { workspaceId } = await requireWorkspace();

  const row = await db.settings.findUnique({ where: { workspaceId } });

  if (!row) return DEFAULTS;

  return {
    defaultProjectId: row.defaultProjectId,
    currency: row.currency,
    timezone: row.timezone,
    locale: row.locale,
    theme: row.theme,
  };
}

/**
 * What the AI layer is configured to do.
 *
 * Reports whether a key is present — never the key itself. There is no code
 * path that returns it, so it cannot leak into a page, a log or a backup.
 */
export async function getAiStatus() {
  const env = getServerEnv();
  const provider = getProvider();

  // Which key matters depends on the provider, so presence is checked against
  // the one actually in use rather than against Anthropic's alone.
  const keyByProvider: Record<string, string | undefined> = {
    anthropic: env.ANTHROPIC_API_KEY,
    gemini: env.GOOGLE_API_KEY,
    groq: env.GROQ_API_KEY,
    openrouter: env.OPENROUTER_API_KEY,
  };

  return {
    provider: env.AI_PROVIDER,
    model: provider.defaultModel,
    hasApiKey: env.AI_PROVIDER === "mock" || Boolean(keyByProvider[env.AI_PROVIDER]),
    timeoutMs: env.AI_TIMEOUT_MS,
    maxAttempts: env.AI_MAX_ATTEMPTS,
    isMock: env.AI_PROVIDER === "mock",
  };
}

/** Row counts for the data section, so "what is in here" is answerable. */
export async function getDataStats() {
  const { workspaceId } = await requireWorkspace();

  // Every child table reaches the workspace through its project, so one
  // predicate scopes all of them: `project: { workspaceId }`.
  const project = { project: { workspaceId } };

  const [
    projects,
    metrics,
    contentItems,
    campaigns,
    recommendations,
    experiments,
    conversations,
    agentRuns,
  ] = await Promise.all([
    db.project.count({ where: { workspaceId } }),
    db.marketingMetric.count({ where: project }),
    db.contentItem.count({ where: project }),
    db.campaign.count({ where: project }),
    db.recommendation.count({ where: project }),
    db.experiment.count({ where: project }),
    db.conversation.count({ where: project }),
    db.agentRun.count({ where: project }),
  ]);

  return {
    projects,
    metrics,
    contentItems,
    campaigns,
    recommendations,
    experiments,
    conversations,
    agentRuns,
    total:
      projects +
      metrics +
      contentItems +
      campaigns +
      recommendations +
      experiments +
      conversations +
      agentRuns,
  };
}
