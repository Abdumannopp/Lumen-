"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, Unplug, AlertTriangle } from "lucide-react";

import type { GoogleConnectionRecord } from "@/lib/integrations/google/queries";
import { disconnectGoogleAction, saveGoogleSelectionAction, syncGoogleAction } from "@/lib/integrations/google/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

export function GoogleConnectionCard({
  projectId,
  configured,
  connection,
}: {
  projectId: string;
  configured: boolean;
  connection: GoogleConnectionRecord | null;
}) {
  const router = useRouter();
  const [working, startWorking] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [analyticsPropertyId, setAnalyticsPropertyId] = useState(connection?.analyticsPropertyId ?? "");
  const [searchConsoleSiteUrl, setSearchConsoleSiteUrl] = useState(connection?.searchConsoleSiteUrl ?? "");

  function saveSelection() {
    setMessage(null);
    setError(null);
    startWorking(async () => {
      const result = await saveGoogleSelectionAction(projectId, {
        analyticsPropertyId,
        searchConsoleSiteUrl,
      });
      if (!result.ok) setError(result.message ?? "Could not save Google settings.");
      else {
        setMessage("Google sources saved.");
        router.refresh();
      }
    });
  }

  function sync() {
    setMessage(null);
    setError(null);
    startWorking(async () => {
      const result = await syncGoogleAction(projectId);
      if (!result.ok) setError(result.message ?? "Google sync failed.");
      else {
        setMessage(`Synced ${result.synced ?? 0} daily records.`);
        router.refresh();
      }
    });
  }

  function disconnect() {
    setMessage(null);
    setError(null);
    startWorking(async () => {
      const result = await disconnectGoogleAction(projectId);
      if (!result.ok) setError(result.message ?? "Could not disconnect Google.");
      else {
        setMessage("Google disconnected. Imported Google records were removed.");
        router.refresh();
      }
    });
  }

  if (!configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-4" />
            Connect Google
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Google Analytics 4 and Search Console are ready, but the deployment needs Google OAuth credentials first.
          </p>
          <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">
            Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and INTEGRATION_ENCRYPTION_KEY on the server.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!connection) {
    return (
      <Card variant="aurora">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="size-4" />
            Connect Google
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-foreground">Bring real acquisition data into Lumen.</p>
            <p className="text-sm text-muted-foreground">Read-only access to GA4 and Search Console.</p>
          </div>
          <Button asChild>
            <a href={`/api/integrations/google/start?projectId=${encodeURIComponent(projectId)}`}>
              Connect Google
              <ExternalLink />
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const analyticsOptions = connection.analyticsProperties;
  const siteOptions = connection.searchConsoleSites;
  const connected = connection.status === "CONNECTED";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              {connected ? <CheckCircle2 className="size-4 text-success" /> : <AlertTriangle className="size-4 text-destructive" />}
              Google data connection
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Read-only sync for the last 30 completed days.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={sync} disabled={working}>
              {working ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Sync now
            </Button>
            <Button size="sm" variant="ghost" onClick={disconnect} disabled={working}>
              {working ? <Loader2 className="animate-spin" /> : <Unplug />}
              Disconnect
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {(message || error) && (
          <div className={error ? "rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm" : "rounded-xl border border-success/35 bg-success/8 px-4 py-3 text-sm"}>
            {error ?? message}
          </div>
        )}

        {analyticsOptions.length > 0 ? (
          <div className="space-y-2">
            <label className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase" htmlFor="google-analytics-property">
              Google Analytics property
            </label>
            <Select id="google-analytics-property" value={analyticsPropertyId} onChange={(event) => setAnalyticsPropertyId(event.target.value)}>
              <option value="">Choose a property</option>
              {analyticsOptions.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name} — {property.accountName}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No Google Analytics property was available to this account.</p>
        )}

        {siteOptions.length > 0 ? (
          <div className="space-y-2">
            <label className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase" htmlFor="search-console-site">
              Search Console property
            </label>
            <Select id="search-console-site" value={searchConsoleSiteUrl} onChange={(event) => setSearchConsoleSiteUrl(event.target.value)}>
              <option value="">Choose a property</option>
              {siteOptions.map((site) => (
                <option key={site.url} value={site.url}>
                  {site.url}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No Search Console property was available to this account.</p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {connection.lastSyncAt ? `Last sync: ${connection.lastSyncAt.toLocaleString("en-US")}` : "Not synced yet."}
          </p>
          <Button onClick={saveSelection} disabled={working}>
            {working ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            Save sources
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
