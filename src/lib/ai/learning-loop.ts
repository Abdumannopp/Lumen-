import "server-only";

import { db } from "@/lib/db";
import { requireProject, requireWorkspace } from "@/lib/auth/dal";
import { isFounderEmail } from "@/lib/beta/invites";

const ACTIVE_RECOMMENDATION_STATES = new Set(["ACCEPTED", "IN_PROGRESS", "DONE"]);

function pct(n: number, d: number) {
  return d === 0 ? null : Math.round((n / d) * 100);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export interface AILearningSignals {
  windowDays: 90;
  recommendationDecisions: {
    total: number;
    decided: number;
    adopted: number;
    dismissed: number;
    adoptionRate: number | null;
  };
  execution: {
    completed: number;
    skipped: number;
    outcomeCaptured: number;
    completionRate: number | null;
    outcomeCaptureRate: number | null;
  };
  reliability: {
    runs: number;
    settled: number;
    succeeded: number;
    successRate: number | null;
    medianLatencyMs: number | null;
  };
  feedback: {
    responses: number;
    recent: { mostUseful: string | null; leastUseful: string | null; overall: string | null }[];
  };
  recentLessons: { kind: "task_outcome" | "task_skip" | "experiment" | "feedback"; text: string }[];
}

/**
 * Deterministic learning signals built from operator decisions and recorded
 * outcomes. These are proxies for usefulness, not causal proof of AI impact.
 */
async function loadAILearningSignals(projectIds: string[], workspaceIds: string[]): Promise<AILearningSignals> {
  const since = new Date(Date.now() - 90 * 86_400_000);

  if (projectIds.length === 0) {
    return {
      windowDays: 90,
      recommendationDecisions: { total: 0, decided: 0, adopted: 0, dismissed: 0, adoptionRate: null },
      execution: { completed: 0, skipped: 0, outcomeCaptured: 0, completionRate: null, outcomeCaptureRate: null },
      reliability: { runs: 0, settled: 0, succeeded: 0, successRate: null, medianLatencyMs: null },
      feedback: { responses: 0, recent: [] },
      recentLessons: [],
    };
  }

  const [recommendations, plans, runs, experiments, feedback] = await Promise.all([
    db.recommendation.findMany({
      where: { projectId: { in: projectIds }, source: "AI", createdAt: { gte: since } },
      select: { status: true },
    }),
    db.weeklyPlan.findMany({
      where: { projectId: { in: projectIds }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        tasks: {
          select: { title: true, status: true, completionNote: true, skipReason: true },
        },
      },
    }),
    db.agentRun.findMany({
      where: { projectId: { in: projectIds }, startedAt: { gte: since } },
      select: { status: true, latencyMs: true },
    }),
    db.experiment.findMany({
      where: { projectId: { in: projectIds }, status: "COMPLETED", learning: { not: null }, updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: { name: true, learning: true },
    }),
    db.feedback.findMany({
      where: { workspaceId: { in: workspaceIds }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { mostUseful: true, leastUseful: true, overall: true },
    }),
  ]);

  const decided = recommendations.filter((row) => row.status !== "OPEN").length;
  const adopted = recommendations.filter((row) => ACTIVE_RECOMMENDATION_STATES.has(row.status)).length;
  const dismissed = recommendations.filter((row) => row.status === "DISMISSED").length;

  const tasks = plans.flatMap((plan) => plan.tasks);
  const completed = tasks.filter((task) => task.status === "DONE").length;
  const skipped = tasks.filter((task) => task.status === "SKIPPED").length;
  const outcomeCaptured = tasks.filter((task) => task.status === "DONE" && Boolean(task.completionNote?.trim())).length;
  const settledRuns = runs.filter((run) => run.status !== "RUNNING").length;
  const succeededRuns = runs.filter((run) => run.status === "SUCCEEDED").length;
  const latency = runs.flatMap((run) => (run.latencyMs === null ? [] : [run.latencyMs]));

  const recentLessons: AILearningSignals["recentLessons"] = [];
  for (const task of tasks) {
    if (task.status === "DONE" && task.completionNote?.trim()) {
      recentLessons.push({ kind: "task_outcome", text: `${task.title}: ${task.completionNote.trim()}` });
    } else if (task.status === "SKIPPED" && task.skipReason?.trim()) {
      recentLessons.push({ kind: "task_skip", text: `${task.title}: skipped — ${task.skipReason.trim()}` });
    }
    if (recentLessons.length >= 8) break;
  }

  for (const experiment of experiments) {
    if (experiment.learning?.trim()) {
      recentLessons.push({ kind: "experiment", text: `${experiment.name}: ${experiment.learning.trim()}` });
    }
    if (recentLessons.length >= 10) break;
  }

  for (const entry of feedback) {
    const useful = entry.mostUseful?.trim();
    const unhelpful = entry.leastUseful?.trim();
    const overall = entry.overall?.trim();
    const parts = [useful ? `useful: ${useful}` : "", unhelpful ? `less useful: ${unhelpful}` : "", overall ? `overall: ${overall}` : ""].filter(Boolean);
    if (parts.length) recentLessons.push({ kind: "feedback", text: parts.join("; ") });
    if (recentLessons.length >= 12) break;
  }

  return {
    windowDays: 90,
    recommendationDecisions: {
      total: recommendations.length,
      decided,
      adopted,
      dismissed,
      adoptionRate: pct(adopted, decided),
    },
    execution: {
      completed,
      skipped,
      outcomeCaptured,
      completionRate: pct(completed, completed + skipped),
      outcomeCaptureRate: pct(outcomeCaptured, completed),
    },
    reliability: {
      runs: runs.length,
      settled: settledRuns,
      succeeded: succeededRuns,
      successRate: pct(succeededRuns, settledRuns),
      medianLatencyMs: median(latency),
    },
    feedback: {
      responses: feedback.length,
      recent: feedback.map((entry) => ({
        mostUseful: entry.mostUseful,
        leastUseful: entry.leastUseful,
        overall: entry.overall,
      })),
    },
    recentLessons: recentLessons.slice(0, 12),
  };
}

export async function getAILearningSignals(projectId: string): Promise<AILearningSignals> {
  await requireProject(projectId);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
  return loadAILearningSignals([projectId], project ? [project.workspaceId] : []);
}

/** Founder-only aggregate across workspaces owned by the founder. */
export async function getFounderAILearningSignals(): Promise<AILearningSignals | null> {
  const context = await requireWorkspace();
  if (!isFounderEmail(context.email)) return null;

  const projects = await db.project.findMany({
    where: { workspace: { ownerId: context.userId } },
    select: { id: true, workspaceId: true },
  });

  return loadAILearningSignals(
    projects.map((project) => project.id),
    [...new Set(projects.map((project) => project.workspaceId))],
  );
}
