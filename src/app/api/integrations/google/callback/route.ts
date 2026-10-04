import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { requireProject } from "@/lib/auth/dal";
import { listAnalyticsProperties, listSearchConsoleSites } from "@/lib/integrations/google/api";
import { exchangeGoogleCode, readGoogleState } from "@/lib/integrations/google/oauth";
import { storeGoogleConnection } from "@/lib/integrations/google/actions";
import { getProject } from "@/lib/projects/queries";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const jar = await cookies();
  const stateCookie = jar.get("lumen.google_oauth_state")?.value;
  jar.delete("lumen.google_oauth_state");

  if (!stateCookie || !stateParam || stateCookie !== stateParam) {
    return NextResponse.redirect(new URL("/analytics?google=invalid-state", url.origin));
  }

  let state;
  try {
    state = readGoogleState(stateCookie);
  } catch {
    return NextResponse.redirect(new URL("/analytics?google=expired", url.origin));
  }

  if (oauthError || !code) {
    return NextResponse.redirect(new URL(`/analytics?google=cancelled`, url.origin));
  }

  try {
    await requireProject(state.projectId);
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.refreshToken) {
      return NextResponse.redirect(new URL(`/analytics?google=no-refresh-token`, url.origin));
    }

    const [analyticsResult, searchConsoleResult] = await Promise.allSettled([
      listAnalyticsProperties(tokens.accessToken),
      listSearchConsoleSites(tokens.accessToken),
    ]);

    const analyticsProperties = analyticsResult.status === "fulfilled" ? analyticsResult.value : [];
    const searchConsoleSites = searchConsoleResult.status === "fulfilled" ? searchConsoleResult.value : [];

    if (analyticsResult.status === "rejected" && searchConsoleResult.status === "rejected") {
      throw new Error("Google Analytics and Search Console permissions could not be read.");
    }

    const project = await getProject(state.projectId);
    const websiteHost = project?.website ? new URL(project.website).hostname.replace(/^www\./, "").toLowerCase() : null;
    const matchingSite = searchConsoleSites.find((site) => {
      try {
        const host = new URL(site.url).hostname.replace(/^www\./, "").toLowerCase();
        return websiteHost && host === websiteHost;
      } catch {
        return false;
      }
    });
    const chosenSite = matchingSite?.url ?? (searchConsoleSites.length === 1 ? searchConsoleSites[0]?.url : null);
    const chosenProperty = analyticsProperties.length === 1 ? analyticsProperties[0] : null;

    await storeGoogleConnection({
      projectId: state.projectId,
      refreshToken: tokens.refreshToken,
      scopes: tokens.scope,
      analyticsProperties,
      searchConsoleSites,
      analyticsPropertyId: chosenProperty?.id ?? null,
      analyticsPropertyName: chosenProperty?.name ?? null,
      searchConsoleSiteUrl: chosenSite ?? null,
    });

    return NextResponse.redirect(new URL(`/analytics?google=connected`, url.origin));
  } catch {
    return NextResponse.redirect(new URL(`/analytics?google=failed`, url.origin));
  }
}
