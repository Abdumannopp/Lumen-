import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import {
  SECTION_KEYS,
  strategyBodySchema,
  type StrategyBody,
  type StrategySection,
} from "@/lib/strategy/agent";

/**
 * Strategy reads.
 *
 * Version bodies are JSON, so they are parsed through the schema on the way out
 * rather than cast. A version written by an older shape degrades to whatever
 * still validates instead of crashing the page.
 *
 * Every function here begins with `requireProject`. The projectId reaching it
 * came from a page, and a page's parameters come from a URL — so "is this the
 * caller's project" is a question the query has to ask, not one it may assume
 * was asked upstream.
 */

export interface StrategyVersionRecord {
  id: string;
  version: number;
  note: string;
  createdAt: Date;
  agentRunId: string | null;
  body: StrategyBody;
}

const EMPTY_BODY: StrategyBody = { sections: [], assumptions: [], missingInformation: [] };

function parseBody(row: {
  sections: unknown;
  assumptions: unknown;
  missingInformation: unknown;
}): StrategyBody {
  const parsed = strategyBodySchema.safeParse({
    sections: row.sections,
    assumptions: row.assumptions,
    missingInformation: row.missingInformation,
  });

  if (!parsed.success) return EMPTY_BODY;

  // Present sections in the specified order regardless of how they were stored.
  const byKey = new Map(parsed.data.sections.map((section) => [section.key, section]));
  const ordered = SECTION_KEYS.map((key) => byKey.get(key)).filter(
    (section): section is StrategySection => Boolean(section),
  );

  return { ...parsed.data, sections: ordered };
}

export async function getStrategy(projectId: string) {
  await requireProject(projectId);

  const strategy = await db.strategy.findUnique({
    where: { projectId },
    include: { versions: { orderBy: { version: "desc" } } },
  });

  if (!strategy) return null;

  const versions: StrategyVersionRecord[] = strategy.versions.map((row) => ({
    id: row.id,
    version: row.version,
    note: row.note,
    createdAt: row.createdAt,
    agentRunId: row.agentRunId,
    body: parseBody(row),
  }));

  const current =
    versions.find((version) => version.id === strategy.currentVersionId) ?? versions[0] ?? null;

  return { id: strategy.id, projectId, current, versions };
}

export async function getStrategyVersion(projectId: string, versionId: string) {
  await requireProject(projectId);

  const row = await db.strategyVersion.findFirst({
    // Scoped through the parent so a version id from another project cannot be
    // opened by guessing it.
    where: { id: versionId, strategy: { projectId } },
  });

  if (!row) return null;

  return {
    id: row.id,
    version: row.version,
    note: row.note,
    createdAt: row.createdAt,
    agentRunId: row.agentRunId,
    body: parseBody(row),
  } satisfies StrategyVersionRecord;
}
