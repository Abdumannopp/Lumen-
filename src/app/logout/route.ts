import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { getAuthProvider } from "@/lib/auth/providers";
import { clearActiveWorkspaceId, getCurrentUser } from "@/lib/auth/dal";
import { logger } from "@/lib/logger";

/**
 * Sign out.
 *
 * POST only, and same-origin only.
 *
 * POST because a `GET /logout` can be fired by anything that fetches a URL on
 * someone's behalf — a link prefetch, an `<img>` on another site, a mail client
 * warming its links — and being signed out because you opened an email is a
 * small denial of service that costs nothing to avoid.
 *
 * Same-origin because a plain route handler, unlike a Server Action, has no
 * origin check of its own: without this, another site could auto-submit a form
 * here and sign people out. `Sec-Fetch-Site` is sent by current browsers on
 * every request; where it is missing the `Origin` header is checked instead,
 * and a request carrying neither is refused rather than trusted.
 *
 * A route handler rather than a Server Action for one further reason: Server
 * Actions are numbered per page in the order they are rendered, and putting one
 * in the application chrome would renumber the action fields of every form
 * below it — which is invisible in a browser and breaks anything driving the
 * forms directly.
 */
function sameOrigin(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");

  if (site) return site === "same-origin" || site === "none";

  const origin = request.headers.get("origin");

  return origin ? origin === request.nextUrl.origin : false;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    logger.warn("Cross-origin sign-out refused", {
      site: request.headers.get("sec-fetch-site"),
      origin: request.headers.get("origin"),
    });

    return new Response("Forbidden", { status: 403 });
  }

  const user = await getCurrentUser();

  await getAuthProvider().signOut();
  await clearActiveWorkspaceId();

  if (user) logger.info("Signed out", { userId: user.id });

  redirect("/login?notice=signed-out");
}
