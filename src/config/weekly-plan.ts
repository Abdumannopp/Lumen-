import { MARKETING_CHANNELS } from "@/config/business-profile";

/**
 * What a weekly plan is allowed to ask for.
 *
 * The interesting decision here is which channels cost money. It is not a
 * detail: a business with no budget that is handed "run paid search" has been
 * given a plan it cannot act on, and a product that does that once is not
 * trusted again. So the guardrail is deterministic and lives in configuration
 * rather than in a prompt — the model can be persuaded, a Set cannot.
 *
 * "Paid" means the channel needs money before the first result, not that money
 * could help. Events go on the list because a stand costs what it costs;
 * influencer and affiliate go on it because both start with a payment or a
 * commitment to one. SEO, content, email and community take time instead, which
 * a founder with no budget still has.
 */

/** Channels that cannot start without spending money. */
export const PAID_CHANNELS = new Set([
  "paid-search",
  "paid-social",
  "influencer",
  "affiliate",
  "events",
  "offline",
]);

export const isPaidChannel = (channel: string) => PAID_CHANNELS.has(channel);

/**
 * Where a plan may send someone who has told us nothing about their channels.
 *
 * An empty answer in onboarding is not permission to suggest anything: it means
 * we do not know. These are the channels any business can start on its own,
 * without a budget and without an existing audience, so they are the safe floor
 * — and the plan says plainly that it is working from an incomplete picture.
 */
export const DEFAULT_CHANNELS = ["seo", "content", "organic-social", "email", "community"];

export const CHANNEL_VALUES_SET = new Set(MARKETING_CHANNELS.map((option) => option.value));

/** Task priorities, highest first — the order a plan is read in. */
export const TASK_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;

export type TaskPriorityKey = (typeof TASK_PRIORITIES)[number];

const PRIORITY_RANK: Record<TaskPriorityKey, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export const priorityRank = (priority: TaskPriorityKey) => PRIORITY_RANK[priority];

/**
 * Why someone skipped a task.
 *
 * A fixed list rather than free text, because these answers are read back by
 * the next plan and free text cannot be counted. The optional note is where the
 * particulars go. "Not relevant" and "not now" are deliberately separate: one
 * means never suggest this again, the other means ask me later.
 */
export const SKIP_REASONS = [
  { value: "not-relevant", label: "Not relevant to my business" },
  { value: "no-time", label: "No time this week" },
  { value: "no-budget", label: "Cannot afford it" },
  { value: "already-doing", label: "Already doing this" },
  { value: "not-now", label: "Good idea, but not now" },
  { value: "unclear", label: "I do not understand what to do" },
] as const;

export type SkipReasonKey = (typeof SKIP_REASONS)[number]["value"];

export const SKIP_REASON_VALUES = SKIP_REASONS.map((reason) => reason.value);

const SKIP_LABELS = Object.fromEntries(SKIP_REASONS.map((r) => [r.value, r.label]));

export const skipReasonLabel = (value: string) => SKIP_LABELS[value] ?? value;

/** How many tasks a week may hold. */
export const MIN_TASKS = 1;
export const MAX_TASKS = 7;

/**
 * Bumped whenever the prompt or the output contract changes.
 *
 * Stored on every plan. Without it, "plans got worse last Tuesday" is a
 * complaint; with it, it is a query.
 */
export const PROMPT_VERSION = "weekly-plan/1";
