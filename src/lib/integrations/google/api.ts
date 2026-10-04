import "server-only";

interface GoogleErrorPayload {
  error?: { message?: string };
}

async function googleFetch<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(15_000),
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Google API returned ${response.status}.`;
    try {
      const payload = (await response.json()) as GoogleErrorPayload;
      message = payload.error?.message ?? message;
    } catch {
      // Keep the generic status error when Google did not return JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

interface AccountSummariesResponse {
  accountSummaries?: Array<{
    account?: string;
    displayName?: string;
    propertySummaries?: Array<{ property?: string; displayName?: string }>;
  }>;
  nextPageToken?: string;
}

export interface AnalyticsPropertyOption {
  id: string;
  name: string;
  accountName: string;
}

export async function listAnalyticsProperties(accessToken: string): Promise<AnalyticsPropertyOption[]> {
  const properties: AnalyticsPropertyOption[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ pageSize: "200" });
    if (pageToken) query.set("pageToken", pageToken);

    const payload = await googleFetch<AccountSummariesResponse>(
      `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?${query.toString()}`,
      accessToken,
    );

    for (const account of payload.accountSummaries ?? []) {
      for (const property of account.propertySummaries ?? []) {
        const raw = property.property;
        if (!raw) continue;
        properties.push({
          id: raw.replace(/^properties\//, ""),
          name: property.displayName ?? raw,
          accountName: account.displayName ?? account.account ?? "Google Analytics",
        });
      }
    }

    pageToken = payload.nextPageToken;
    if (!pageToken) break;
  }

  return properties;
}

interface SearchConsoleSitesResponse {
  siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
}

export interface SearchConsoleSiteOption {
  url: string;
  permissionLevel?: string;
}

export async function listSearchConsoleSites(accessToken: string): Promise<SearchConsoleSiteOption[]> {
  const payload = await googleFetch<SearchConsoleSitesResponse>(
    "https://www.googleapis.com/webmasters/v3/sites",
    accessToken,
  );

  return (payload.siteEntry ?? [])
    .flatMap((site) => (site.siteUrl ? [{ url: site.siteUrl, permissionLevel: site.permissionLevel }] : []));
}

interface AnalyticsReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}

interface SearchConsoleReportResponse {
  rows?: Array<{
    keys?: string[];
    clicks?: number;
    impressions?: number;
  }>;
}

function numberValue(value?: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface GA4DailyRow {
  day: string;
  conversions: number;
  purchasers: number;
  users: number;
  sessions: number;
  totalRevenue: number;
}

export async function runGa4DailyReport(accessToken: string, propertyId: string, startDate: string, endDate: string) {
  const payload = await googleFetch<AnalyticsReportResponse>(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    accessToken,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "conversions" },
          { name: "totalPurchasers" },
          { name: "totalUsers" },
          { name: "sessions" },
          { name: "totalRevenue" },
        ],
      }),
    },
  );

  return (payload.rows ?? []).flatMap((row) => {
    const dayRaw = row.dimensionValues?.[0]?.value;
    if (!dayRaw || !/^\d{8}$/.test(dayRaw)) return [];
    return [{
      day: `${dayRaw.slice(0, 4)}-${dayRaw.slice(4, 6)}-${dayRaw.slice(6, 8)}`,
      conversions: Math.round(numberValue(row.metricValues?.[0]?.value)),
      purchasers: Math.round(numberValue(row.metricValues?.[1]?.value)),
      users: Math.round(numberValue(row.metricValues?.[2]?.value)),
      sessions: Math.round(numberValue(row.metricValues?.[3]?.value)),
      totalRevenue: numberValue(row.metricValues?.[4]?.value),
    }];
  }) satisfies GA4DailyRow[];
}

export interface SearchConsoleDailyRow {
  day: string;
  clicks: number;
  impressions: number;
}

export async function runSearchConsoleDailyReport(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string,
) {
  const encodedSite = encodeURIComponent(siteUrl);
  const payload = await googleFetch<SearchConsoleReportResponse>(
    `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
    accessToken,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["date"],
        rowLimit: 25000,
        startRow: 0,
      }),
    },
  );

  return (payload.rows ?? []).flatMap((row) => {
    const day = row.keys?.[0];
    if (!day) return [];
    return [{
      day,
      clicks: Math.round(numberValue(row.clicks)),
      impressions: Math.round(numberValue(row.impressions)),
    }];
  }) satisfies SearchConsoleDailyRow[];
}
