import "server-only";

import { db } from "@/lib/db";
import { requireProject } from "@/lib/auth/dal";
import type { GoogleConnectionStatus } from "@/generated/prisma/enums";

export interface AnalyticsPropertyOption {
  id: string;
  name: string;
  accountName: string;
}

export interface SearchConsoleSiteOption {
  url: string;
  permissionLevel?: string;
}

export interface GoogleConnectionRecord {
  id: string;
  projectId: string;
  status: GoogleConnectionStatus;
  analyticsPropertyId: string | null;
  analyticsPropertyName: string | null;
  analyticsProperties: AnalyticsPropertyOption[];
  searchConsoleSiteUrl: string | null;
  searchConsoleSites: SearchConsoleSiteOption[];
  lastSyncAt: Date | null;
  lastError: string | null;
}

function parseArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function getGoogleConnection(projectId: string): Promise<GoogleConnectionRecord | null> {
  await requireProject(projectId);

  const connection = await db.googleConnection.findUnique({ where: { projectId } });
  if (!connection) return null;

  return {
    id: connection.id,
    projectId: connection.projectId,
    status: connection.status,
    analyticsPropertyId: connection.analyticsPropertyId,
    analyticsPropertyName: connection.analyticsPropertyName,
    analyticsProperties: parseArray<AnalyticsPropertyOption>(connection.analyticsProperties),
    searchConsoleSiteUrl: connection.searchConsoleSiteUrl,
    searchConsoleSites: parseArray<SearchConsoleSiteOption>(connection.searchConsoleSites),
    lastSyncAt: connection.lastSyncAt,
    lastError: connection.lastError,
  };
}
