import "server-only";

import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/dal";
import { getAllowance, type Allowance } from "@/lib/usage/quota";
import { LOW_ALLOWANCE_THRESHOLD } from "@/config/usage";

/**
 * What this workspace has used, and what it cost.
 *
 * Section 10 of the brief asks for four things to be visible: total cost, error
 * rate, the most expensive feature, and remaining allowance. All four are here,
 * and one thing deliberately is not — the provider's API key, its identity in
 * any error message, or the raw prompts. What is shown is what was spent, not
 * how the sausage is made.
 *
 * Every figure is scoped to one workspace. "What is everyone's AI bill" is not
 * a question this product answers to a customer.
 */

export interface FeatureUsage {
  featureKey: string;
  runs: number;
  costUsd: number;
  /** Runs whose model has no published rate, so the cost is a floor not a total. */
  unpriced: number;
}

export interface UsageSummary {
  allowance: Allowance;
  /** True once the allowance is nearly gone, so the interface can say so early. */
  low: boolean;
  runs: number;
  failed: number;
  /** Failed runs as a fraction of all runs in this period. */
  errorRate: number;
  costUsd: number;
  unpricedRuns: number;
  byFeature: FeatureUsage[];
  mostExpensive: FeatureUsage | null;
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const { workspaceId } = await requireWorkspace();
  const allowance = await getAllowance(workspaceId);

  // Bounded to the current period, so the number beside the allowance and the
  // number in the cost column describe the same span of time. Reporting a
  // lifetime cost next to a monthly allowance invites exactly one wrong
  // conclusion, and it is the expensive one.
  const window = { workspaceId, startedAt: { gte: allowance.periodStart } };

  const [runs, failed, grouped, unpricedRuns] = await Promise.all([
    db.agentRun.count({ where: window }),
    db.agentRun.count({ where: { ...window, status: { in: ["FAILED", "TIMED_OUT"] } } }),
    db.agentRun.groupBy({
      by: ["featureKey"],
      where: window,
      _count: { _all: true },
      _sum: { estimatedCostUsd: true },
    }),
    db.agentRun.count({ where: { ...window, estimatedCostUsd: null, status: "SUCCEEDED" } }),
  ]);

  const unpricedByFeature = await db.agentRun.groupBy({
    by: ["featureKey"],
    where: { ...window, estimatedCostUsd: null, status: "SUCCEEDED" },
    _count: { _all: true },
  });

  const unpricedLookup = new Map(
    unpricedByFeature.map((row) => [row.featureKey ?? "unattributed", row._count._all]),
  );

  const byFeature: FeatureUsage[] = grouped
    .map((row) => {
      const featureKey = row.featureKey ?? "unattributed";

      return {
        featureKey,
        runs: row._count._all,
        costUsd: row._sum.estimatedCostUsd ?? 0,
        unpriced: unpricedLookup.get(featureKey) ?? 0,
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.runs - a.runs);

  const costUsd = byFeature.reduce((sum, row) => sum + row.costUsd, 0);

  return {
    allowance,
    low: allowance.limit > 0 && allowance.remaining / allowance.limit <= LOW_ALLOWANCE_THRESHOLD,
    runs,
    failed,
    // Zero rather than NaN when nothing has run. A dashboard that prints NaN
    // has told the operator their data is broken when it is merely empty.
    errorRate: runs === 0 ? 0 : failed / runs,
    costUsd,
    unpricedRuns,
    byFeature,
    mostExpensive: byFeature.find((row) => row.costUsd > 0) ?? byFeature[0] ?? null,
  };
}

/**
 * Just the allowance, for surfaces that only need the number beside a button.
 *
 * Separate from the summary above because the plan page would otherwise run
 * four aggregate queries to render one sentence.
 */
export async function getAllowanceForCurrentWorkspace(): Promise<Allowance> {
  const { workspaceId } = await requireWorkspace();
  return getAllowance(workspaceId);
}
