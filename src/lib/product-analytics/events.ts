import "server-only";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/** Meaningful, value-producing product actions. Page views are intentionally excluded. */
export const PRODUCT_EVENTS = {
  PROJECT_CREATED: "project.created",
  ONBOARDING_COMPLETED: "onboarding.completed",
  GOOGLE_CONNECTED: "analytics.google_connected",
  ANALYTICS_SYNCED: "analytics.synced",
  ANALYTICS_METRIC_SAVED: "analytics.metric_saved",
  RECOMMENDATIONS_GENERATED: "recommendations.generated",
  RECOMMENDATION_STATUS_CHANGED: "recommendation.status_changed",
  WEEKLY_PLAN_GENERATED: "weekly_plan.generated",
  TASK_COMPLETED: "task.completed",
  TASK_SKIPPED: "task.skipped",
  TASK_OUTCOME_RECORDED: "task.outcome_recorded",
  EXPERIMENT_CREATED: "experiment.created",
  EXPERIMENT_COMPLETED: "experiment.completed",
  SUBSCRIPTION_ACTIVE: "subscription.active",
  SIGNUP_COMPLETED: "signup.completed",
  SIGNUP_ATTRIBUTED: "signup.attributed",
  FEEDBACK_SUBMITTED: "feedback.submitted",
} as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[keyof typeof PRODUCT_EVENTS];

const MAX_METADATA_KEYS = 12;
const MAX_METADATA_VALUE = 240;

function safeMetadata(input: Record<string, string | number | boolean> | undefined) {
  if (!input) return undefined;

  return Object.fromEntries(
    Object.entries(input)
      .slice(0, MAX_METADATA_KEYS)
      .map(([key, value]) => [
        key.slice(0, 80),
        typeof value === "string" ? value.slice(0, MAX_METADATA_VALUE) : value,
      ]),
  );
}

/** Best-effort telemetry: event failures never fail a customer action. */
export async function trackProductEvent(params: {
  workspaceId: string;
  userId?: string | null;
  projectId?: string | null;
  eventName: ProductEventName;
  metadata?: Record<string, string | number | boolean>;
}): Promise<void> {
  try {
    await db.productEvent.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId ?? null,
        projectId: params.projectId ?? null,
        eventName: params.eventName,
        metadata: safeMetadata(params.metadata),
      },
    });
  } catch (error) {
    logger.warn("Product analytics event failed", {
      eventName: params.eventName,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
