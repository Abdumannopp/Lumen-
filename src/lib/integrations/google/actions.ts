"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { projectInWorkspace, requireProject } from "@/lib/auth/dal";
import { logger } from "@/lib/logger";
import type { Prisma } from "@/generated/prisma/client";
import { encryptSecret } from "@/lib/integrations/google/crypto";
import { refreshGoogleAccessToken } from "@/lib/integrations/google/oauth";
import { runGa4DailyReport, runSearchConsoleDailyReport, type AnalyticsPropertyOption, type SearchConsoleSiteOption } from "@/lib/integrations/google/api";
import { parseDayInput } from "@/lib/date";
import { PRODUCT_EVENTS, trackProductEvent } from "@/lib/product-analytics/events";

export interface GoogleActionResult {
  ok: boolean;
  message?: string;
  synced?: number;
}

const selectionSchema = z.object({
  analyticsPropertyId: z.string().trim().max(64).optional().transform((value) => value || null),
  searchConsoleSiteUrl: z.string().trim().max(1024).optional().transform((value) => value || null),
});

function asPropertyOptions(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is { id: string; name?: string; accountName?: string } =>
          Boolean(item) && typeof item === "object" && typeof (item as { id?: unknown }).id === "string",
      )
    : [];
}

function asSiteOptions(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is { url: string; permissionLevel?: string } =>
          Boolean(item) && typeof item === "object" && typeof (item as { url?: unknown }).url === "string",
      )
    : [];
}

export async function saveGoogleSelectionAction(
  projectId: string,
  input: z.input<typeof selectionSchema>,
): Promise<GoogleActionResult> {
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the Google integration settings." };

  const connection = await db.googleConnection.findUnique({ where: { projectId } });
  if (!connection) return { ok: false, message: "Connect Google first." };

  const properties = asPropertyOptions(connection.analyticsProperties);
  const sites = asSiteOptions(connection.searchConsoleSites);

  if (parsed.data.analyticsPropertyId && !properties.some((item) => item.id === parsed.data.analyticsPropertyId)) {
    return { ok: false, message: "That Google Analytics property is not available to this connection." };
  }

  if (parsed.data.searchConsoleSiteUrl && !sites.some((item) => item.url === parsed.data.searchConsoleSiteUrl)) {
    return { ok: false, message: "That Search Console property is not available to this connection." };
  }

  const property = properties.find((item) => item.id === parsed.data.analyticsPropertyId);

  await db.googleConnection.update({
    where: { projectId },
    data: {
      analyticsPropertyId: parsed.data.analyticsPropertyId,
      analyticsPropertyName: property?.name ?? null,
      searchConsoleSiteUrl: parsed.data.searchConsoleSiteUrl,
      lastError: null,
      status: "CONNECTED",
    },
  });

  revalidatePath("/analytics");
  return { ok: true };
}

export async function disconnectGoogleAction(projectId: string): Promise<GoogleActionResult> {
  const owned = await projectInWorkspace(projectId);
  if (!owned) return { ok: false, message: "This project no longer exists." };

  await db.googleConnection.deleteMany({ where: { projectId } });
  await db.marketingMetric.deleteMany({
    where: {
      projectId,
      OR: [
        { externalKey: { startsWith: `ga4:${projectId}:` } },
        { externalKey: { startsWith: `gsc:${projectId}:` } },
      ],
    },
  });

  revalidatePath("/analytics");
  return { ok: true };
}

function dayString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function previousDay() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

function startDate() {
  const date = previousDay();
  date.setUTCDate(date.getUTCDate() - 29);
  return dayString(date);
}

export async function syncGoogleAction(projectId: string): Promise<GoogleActionResult> {
  const owned = await requireProject(projectId);

  const connection = await db.googleConnection.findUnique({ where: { projectId } });
  if (!connection) return { ok: false, message: "Connect Google first." };

  try {
    const refreshed = await refreshGoogleAccessToken(connection.refreshTokenEncrypted);
    if (refreshed.refreshToken) {
      await db.googleConnection.update({
        where: { projectId },
        data: { refreshTokenEncrypted: refreshed.refreshToken },
      });
    }

    const end = dayString(previousDay());
    const start = startDate();
    let synced = 0;

    const [ga4Result, gscResult] = await Promise.allSettled([
      connection.analyticsPropertyId
        ? runGa4DailyReport(refreshed.accessToken, connection.analyticsPropertyId, start, end)
        : Promise.resolve([]),
      connection.searchConsoleSiteUrl
        ? runSearchConsoleDailyReport(refreshed.accessToken, connection.searchConsoleSiteUrl, start, end)
        : Promise.resolve([]),
    ]);

    const ga4 = ga4Result.status === "fulfilled" ? ga4Result.value : [];
    const gsc = gscResult.status === "fulfilled" ? gscResult.value : [];
    const sourceErrors = [ga4Result, gscResult]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));

    if (sourceErrors.length === 2 && (connection.analyticsPropertyId || connection.searchConsoleSiteUrl)) {
      throw new Error("Both Google data sources failed: " + sourceErrors.join(" | "));
    }

    for (const row of ga4) {
      if (!parseDayInput(row.day)) continue;
      await db.marketingMetric.upsert({
        where: { externalKey: `ga4:${projectId}:${row.day}` },
        create: {
          projectId,
          date: parseDayInput(row.day)!,
          channel: "Google Analytics",
          campaign: null,
          currency: null,
          spend: null,
          revenue: null,
          impressions: null,
          reach: null,
          clicks: null,
          leads: null,
          conversions: row.conversions,
          customers: row.purchasers,
          note: `GA4: ${row.users.toLocaleString("en-US")} users, ${row.sessions.toLocaleString("en-US")} sessions, ${row.totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 2 })} total revenue.`,
          source: "EXTERNAL",
          externalKey: `ga4:${projectId}:${row.day}`,
        },
        update: {
          conversions: row.conversions,
          customers: row.purchasers,
          note: `GA4: ${row.users.toLocaleString("en-US")} users, ${row.sessions.toLocaleString("en-US")} sessions, ${row.totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 2 })} total revenue.`,
          source: "EXTERNAL",
        },
      });
      synced += 1;
    }

    for (const row of gsc) {
      if (!parseDayInput(row.day)) continue;
      await db.marketingMetric.upsert({
        where: { externalKey: `gsc:${projectId}:${row.day}` },
        create: {
          projectId,
          date: parseDayInput(row.day)!,
          channel: "SEO",
          campaign: null,
          currency: null,
          spend: null,
          revenue: null,
          impressions: row.impressions,
          reach: null,
          clicks: row.clicks,
          leads: null,
          conversions: null,
          customers: null,
          note: `Google Search Console organic search data for ${connection.searchConsoleSiteUrl}.`,
          source: "EXTERNAL",
          externalKey: `gsc:${projectId}:${row.day}`,
        },
        update: {
          impressions: row.impressions,
          clicks: row.clicks,
          note: `Google Search Console organic search data for ${connection.searchConsoleSiteUrl}.`,
          source: "EXTERNAL",
        },
      });
      synced += 1;
    }

    await db.googleConnection.update({
      where: { projectId },
      data: {
        status: "CONNECTED",
        lastSyncAt: new Date(),
        lastError: sourceErrors.length > 0 ? sourceErrors.join(" | ").slice(0, 500) : null,
      },
    });

    await trackProductEvent({
      workspaceId: owned.workspaceId,
      userId: owned.userId,
      projectId,
      eventName: PRODUCT_EVENTS.ANALYTICS_SYNCED,
      metadata: { synced },
    });

    revalidatePath("/analytics");
    logger.info("Google metrics synced", {
      projectId,
      synced,
      hasGa4: Boolean(connection.analyticsPropertyId),
      hasGsc: Boolean(connection.searchConsoleSiteUrl),
      partialFailure: sourceErrors.length > 0,
    });
    return {
      ok: true,
      synced,
      message: sourceErrors.length > 0
        ? `Synced ${synced} daily records; one Google source needs attention.`
        : `Synced ${synced} daily records.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google sync failed.";
    logger.error("Google metrics sync failed", { projectId, message });
    await db.googleConnection.update({
      where: { projectId },
      data: { status: "ERROR", lastError: message.slice(0, 500) },
    });
    return { ok: false, message: "Google sync failed. Reconnect or try again." };
  }
}

/** Called only by the OAuth callback after Google has authenticated the user. */
export async function storeGoogleConnection(params: {
  projectId: string;
  refreshToken: string;
  scopes: string[];
  analyticsProperties: AnalyticsPropertyOption[];
  searchConsoleSites: SearchConsoleSiteOption[];
  analyticsPropertyId?: string | null;
  analyticsPropertyName?: string | null;
  searchConsoleSiteUrl?: string | null;
}): Promise<void> {
  const { projectId, refreshToken, scopes } = params;
  const owned = await requireProject(projectId);

  // Stored in Json columns. Copied into plain objects so Prisma's Json input
  // type accepts them and nothing beyond the declared fields is persisted.
  const analyticsProperties: Prisma.InputJsonValue = params.analyticsProperties.map((property) => ({
    id: property.id,
    name: property.name,
    accountName: property.accountName,
  }));
  const searchConsoleSites: Prisma.InputJsonValue = params.searchConsoleSites.map((site) => ({
    url: site.url,
    ...(site.permissionLevel ? { permissionLevel: site.permissionLevel } : {}),
  }));

  await db.googleConnection.upsert({
    where: { projectId },
    create: {
      projectId,
      refreshTokenEncrypted: encryptSecret(refreshToken),
      scopes,
      analyticsProperties,
      analyticsPropertyId: params.analyticsPropertyId ?? null,
      analyticsPropertyName: params.analyticsPropertyName ?? null,
      searchConsoleSites,
      searchConsoleSiteUrl: params.searchConsoleSiteUrl ?? null,
      status: "CONNECTED",
    },
    update: {
      refreshTokenEncrypted: encryptSecret(refreshToken),
      scopes,
      analyticsProperties,
      analyticsPropertyId: params.analyticsPropertyId ?? null,
      analyticsPropertyName: params.analyticsPropertyName ?? null,
      searchConsoleSites,
      searchConsoleSiteUrl: params.searchConsoleSiteUrl ?? null,
      status: "CONNECTED",
      lastError: null,
    },
  });

  await trackProductEvent({
    workspaceId: owned.workspaceId,
    userId: owned.userId,
    projectId,
    eventName: PRODUCT_EVENTS.GOOGLE_CONNECTED,
    metadata: {
      ga4: Boolean(params.analyticsPropertyId),
      searchConsole: Boolean(params.searchConsoleSiteUrl),
    },
  });
}
