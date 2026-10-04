import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { requireProject } from "@/lib/auth/dal";
import { googleConfigured } from "@/lib/integrations/google/config";
import { getServerEnv } from "@/lib/env";
import { buildGoogleAuthorizationUrl, createGoogleState } from "@/lib/integrations/google/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ message: "projectId is required." }, { status: 400 });

  if (!googleConfigured()) {
    return NextResponse.redirect(new URL(`/analytics?google=not-configured`, url.origin));
  }

  await requireProject(projectId);
  const state = createGoogleState({ projectId, nonce: randomUUID() });
  const env = getServerEnv();
  const jar = await cookies();
  jar.set("lumen.google_oauth_state", state, {
    httpOnly: true,
    secure: env.APP_ENV !== "local",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(buildGoogleAuthorizationUrl(state));
}
