"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { projectInWorkspace } from "@/lib/auth/dal";
import { logger } from "@/lib/logger";
import { parseDayInput } from "@/lib/date";
import { metricSchema, type MetricInput } from "@/lib/analytics/metrics";
import { PRODUCT_EVENTS, trackProductEvent } from "@/lib/product-analytics/events";

/**
 * Analytics writes.
 *
 * Manual entry only. Nothing in this file contacts an external platform, and no
 * row is ever created by anything other than a person typing it.
 */

export interface MetricResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  metricId?: string;
}

export async function saveMetricAction(
  projectId: string,
  input: MetricInput & { metricId?: string },
): Promise<MetricResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const parsed = metricSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  const measures = [
    parsed.data.spend,
    parsed.data.revenue,
    parsed.data.impressions,
    parsed.data.reach,
    parsed.data.clicks,
    parsed.data.leads,
    parsed.data.conversions,
    parsed.data.customers,
  ];

  // A row with a date and a channel but no numbers records nothing. Rejecting it
  // keeps the dataset free of rows that would dilute averages with silence.
  if (measures.every((value) => value === null)) {
    return { ok: false, message: "Enter at least one number for this row." };
  }

  // A day column, pinned to UTC midnight so it reads back as the same day the
  // operator typed, on any machine — see src/lib/date.ts.
  const date = parseDayInput(parsed.data.date);

  if (!date) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: { date: ["Enter a valid date."] },
    };
  }

  const data = {
    date,
    channel: parsed.data.channel,
    campaign: parsed.data.campaign,
    currency: parsed.data.currency,
    spend: parsed.data.spend,
    revenue: parsed.data.revenue,
    impressions: parsed.data.impressions,
    reach: parsed.data.reach,
    clicks: parsed.data.clicks,
    leads: parsed.data.leads,
    conversions: parsed.data.conversions,
    customers: parsed.data.customers,
    note: parsed.data.note,
  };

  try {
    if (input.metricId) {
      const updated = await db.marketingMetric.updateMany({
        where: { id: input.metricId, projectId },
        data,
      });

      if (updated.count === 0) return { ok: false, message: "That row no longer exists." };

      await trackProductEvent({
        workspaceId: owned.workspaceId,
        userId: owned.userId,
        projectId,
        eventName: PRODUCT_EVENTS.ANALYTICS_METRIC_SAVED,
      });

      revalidatePath("/analytics");
      return { ok: true, metricId: input.metricId };
    }

    const created = await db.marketingMetric.create({
      data: { projectId, ...data, source: "MANUAL" },
      select: { id: true },
    });

    await trackProductEvent({
      workspaceId: owned.workspaceId,
      userId: owned.userId,
      projectId,
      eventName: PRODUCT_EVENTS.ANALYTICS_METRIC_SAVED,
    });

    revalidatePath("/analytics");
    return { ok: true, metricId: created.id };
  } catch (error) {
    logger.error("Metric write failed", {
      projectId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: "The row could not be saved." };
  }
}

export async function deleteMetricAction(
  projectId: string,
  metricId: string,
): Promise<MetricResult> {
  // Ownership before anything else: `projectId` arrives from the browser.
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const removed = await db.marketingMetric.deleteMany({ where: { id: metricId, projectId } });

  if (removed.count === 0) return { ok: false, message: "That row does not exist." };

  revalidatePath("/analytics");
  return { ok: true };
}
