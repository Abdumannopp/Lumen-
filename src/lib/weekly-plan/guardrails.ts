import "server-only";

import { createHash } from "node:crypto";

import {
  CHANNEL_VALUES_SET,
  DEFAULT_CHANNELS,
  MAX_TASKS,
  isPaidChannel,
  priorityRank,
  type TaskPriorityKey,
} from "@/config/weekly-plan";
import type { GeneratedTask } from "@/lib/weekly-plan/agent";

/**
 * The rules the model does not get a vote on.
 *
 * Everything here could have been written into the prompt instead, and that is
 * exactly why it is not. A prompt is a request; a business with no money that
 * receives one paid-advertising task has been failed, and "the model usually
 * complies" is not a standard anything else in this codebase is held to.
 *
 * So the prompt asks, and this file enforces. The two say the same thing on
 * purpose — the prompt so the model produces usable output, this so the
 * guarantee holds when it does not.
 *
 * Everything here is a pure function of its inputs. No database, no clock, no
 * randomness: given the same plan and the same profile it returns the same
 * result, which is what makes the rules testable rather than observable.
 */

export interface PlanInputs {
  /** Channel codes the business said it uses. May be empty. */
  channels: string[];
  /** Monthly marketing budget. Null means "not answered", 0 means "none". */
  budgetAmount: number | null;
}

/**
 * Whether this business can spend money this month.
 *
 * Null and zero are treated the same, and that asymmetry is deliberate: a
 * business that has not told us its budget must not be handed a paid campaign
 * on the assumption that it has one. Guessing wrong upward costs the operator
 * money; guessing wrong downward costs them one suggestion.
 */
export function hasZeroBudget(inputs: PlanInputs): boolean {
  return inputs.budgetAmount === null || inputs.budgetAmount <= 0;
}

/**
 * Which channels this plan may use.
 *
 * Starts from what the business said it uses. Where it said nothing, falls back
 * to the channels anyone can start without a budget — see DEFAULT_CHANNELS.
 * Then, if there is no money, every paid channel is removed regardless of
 * whether the business named it: saying "we use paid social" does not mean
 * there is anything to spend this month.
 *
 * If that leaves nothing at all — a business that named only paid channels and
 * has no budget — the free defaults come back rather than an empty list. An
 * empty list would mean a plan with no tasks, which helps nobody.
 */
export function allowedChannels(inputs: PlanInputs): string[] {
  const named = inputs.channels.filter((channel) => CHANNEL_VALUES_SET.has(channel));
  const base = named.length > 0 ? named : DEFAULT_CHANNELS;

  if (!hasZeroBudget(inputs)) return base;

  const free = base.filter((channel) => !isPaidChannel(channel));

  return free.length > 0 ? free : DEFAULT_CHANNELS.filter((channel) => !isPaidChannel(channel));
}

export interface FilterResult {
  tasks: GeneratedTask[];
  /**
   * What was thrown away and why, in the operator's terms.
   *
   * Surfaced rather than swallowed: a plan that quietly arrives with two tasks
   * instead of five looks like a thin answer. One that says "three suggestions
   * were dropped because they needed a budget" is a product explaining itself.
   */
  dropped: { title: string; reason: string }[];
}

/**
 * Apply the rules to what the model returned.
 *
 * Order matters only in that every rule runs against every task; a task is kept
 * when it survives all of them.
 */
export function applyGuardrails(tasks: GeneratedTask[], inputs: PlanInputs): FilterResult {
  const allowed = new Set(allowedChannels(inputs));
  const zeroBudget = hasZeroBudget(inputs);

  const kept: GeneratedTask[] = [];
  const dropped: { title: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const task of tasks) {
    const title = task.title.trim();

    if (zeroBudget && isPaidChannel(task.channel)) {
      dropped.push({ title, reason: "It needs a budget, and this month has none." });
      continue;
    }

    if (!allowed.has(task.channel)) {
      dropped.push({ title, reason: "It uses a channel this business does not." });
      continue;
    }

    // The schema already requires these, so reaching here means the schema and
    // this file have drifted apart. Checked anyway: a task with no steps is the
    // exact failure this whole file exists to prevent, and it costs one `if`.
    if (!task.steps.length || !task.expectedResult.trim() || !task.why.trim()) {
      dropped.push({ title, reason: "It was not specific enough to act on." });
      continue;
    }

    // Models repeat themselves, especially when asked for a list. Two tasks
    // with the same title are one task and one unit of wasted attention.
    const key = title.toLowerCase();
    if (seen.has(key)) {
      dropped.push({ title, reason: "It repeated an earlier task." });
      continue;
    }
    seen.add(key);

    kept.push({ ...task, title });
  }

  // Most important first, and a stable order within a priority so a plan does
  // not reshuffle itself between reads.
  const ordered = kept
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const byPriority =
        priorityRank(a.task.priority as TaskPriorityKey) -
        priorityRank(b.task.priority as TaskPriorityKey);
      return byPriority !== 0 ? byPriority : a.index - b.index;
    })
    .map((entry) => entry.task);

  const capped = ordered.slice(0, MAX_TASKS);

  for (const task of ordered.slice(MAX_TASKS)) {
    dropped.push({ title: task.title, reason: `A week holds ${MAX_TASKS} tasks at most.` });
  }

  return { tasks: capped, dropped };
}

/**
 * A fingerprint of what the plan was asked.
 *
 * Same business, same week, same answers — same hash. It is stored on the plan
 * so "has anything changed since last time?" is answerable without comparing
 * two plans field by field, and so a duplicate generation is recognisable
 * rather than merely suspected.
 *
 * Deliberately built from the *inputs*, never the output: two runs of the same
 * question produce different prose and the same hash, which is the point.
 */
export function hashPlanInputs(parts: {
  projectId: string;
  weekStart: string;
  channels: string[];
  budgetAmount: number | null;
  profileUpdatedAt: string | null;
  projectUpdatedAt: string;
  guidance?: string;
}): string {
  const canonical = JSON.stringify({
    projectId: parts.projectId,
    weekStart: parts.weekStart,
    // Sorted, because "seo, email" and "email, seo" are the same answer.
    channels: [...parts.channels].sort(),
    budgetAmount: parts.budgetAmount,
    profileUpdatedAt: parts.profileUpdatedAt,
    projectUpdatedAt: parts.projectUpdatedAt,
    guidance: parts.guidance?.trim() || null,
  });

  return createHash("sha256").update(canonical).digest("hex");
}
