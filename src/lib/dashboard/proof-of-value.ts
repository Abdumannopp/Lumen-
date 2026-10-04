import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import { getGrowthComparison } from "@/lib/analytics/queries";
import type { MetricTotals } from "@/lib/analytics/metrics";

const OBSERVED_METRICS: {
  key: keyof MetricTotals;
  label: string;
  unit: "count" | "money";
}[] = [
  { key: "leads", label: "Leads", unit: "count" },
  { key: "conversions", label: "Conversions", unit: "count" },
  { key: "customers", label: "Customers", unit: "count" },
  { key: "clicks", label: "Clicks", unit: "count" },
  { key: "revenue", label: "Revenue", unit: "money" },
];

export interface ObservedMovement {
  key: string;
  label: string;
  previous: number;
  recent: number;
  delta: number;
  changePct: number | null;
  unit: "count" | "money";
  currency: string | null;
}

/**
 * Proof of value is deliberately split into three kinds of evidence:
 *
 * 1. execution — work Lumen can prove was completed;
 * 2. outcome capture — what the operator says happened after doing it;
 * 3. observed movement — recorded business metrics changing over comparable
 *    periods, without attributing the movement to Lumen.
 *
 * Causal claims belong to the experiment system, so completed experiments with
 * a learning are shown separately rather than mixed into the metric numbers.
 */
export async function getProofOfValue(projectId: string) {
  await requireProject(projectId);

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - 29);

  const [completedTasks, completedExperiments, comparison] = await Promise.all([
    db.marketingTask.findMany({
      where: {
        status: "DONE",
        completedAt: { gte: since },
        plan: { projectId },
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        title: true,
        completedAt: true,
        completionNote: true,
      },
    }),
    db.experiment.count({
      where: {
        projectId,
        status: "COMPLETED",
        learning: { not: null },
      },
    }),
    getGrowthComparison(projectId),
  ]);

  const outcomeCaptured = completedTasks.filter((task) => Boolean(task.completionNote?.trim())).length;

  const currencyValues = new Set<string>();
  if (comparison.recent.currency) currencyValues.add(comparison.recent.currency);
  if (comparison.previous.currency) currencyValues.add(comparison.previous.currency);
  const currency = currencyValues.size === 1 ? [...currencyValues][0] : null;
  const mixedCurrency = currencyValues.size > 1 || comparison.recent.mixedCurrency || comparison.previous.mixedCurrency;

  const movements = OBSERVED_METRICS.map((metric): ObservedMovement | null => {
    const previous = comparison.previous.totals[metric.key];
    const recent = comparison.recent.totals[metric.key];

    if (previous === null || recent === null) return null;
    if (metric.unit === "money" && mixedCurrency) return null;

    const delta = recent - previous;
    const changePct = previous === 0 ? null : Math.round((delta / Math.abs(previous)) * 100);

    return {
      key: metric.key,
      label: metric.label,
      previous,
      recent,
      delta,
      changePct,
      unit: metric.unit,
      currency: metric.unit === "money" ? currency : null,
    };
  }).filter((item): item is ObservedMovement => item !== null);

  movements.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    windowDays: 30,
    completedTasks: completedTasks.length,
    outcomeCaptured,
    outcomeCaptureRate:
      completedTasks.length === 0 ? 0 : Math.round((outcomeCaptured / completedTasks.length) * 100),
    completedExperiments,
    observedMovements: movements.slice(0, 3),
    hasAnalytics: comparison.recent.rowCount + comparison.previous.rowCount > 0,
    mixedCurrency,
    recentDays: comparison.recentDays,
  };
}
