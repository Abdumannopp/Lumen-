import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { confirmTokenAction } from "@/lib/auth/actions";
import type { ConfirmationType } from "@/lib/auth/types";
import { allowedRedirect } from "@/config/email";

/**
 * The landing point for every emailed link.
 *
 * A route handler rather than a page, because the browser arrives here by
 * navigation carrying a token, and the only useful outcome is a session and a
 * redirect. Nothing is rendered, so the token never reaches a page's HTML and
 * never sits in a rendered URL that could be shared or logged by a proxy.
 *
 * Two things are checked before anything happens, and both are the kind that
 * look pedantic until they are not:
 *
 *   the confirmation type must be one we recognise, because it is passed
 *   straight to the provider's verifier
 *
 *   `next` must be one of a handful of paths we publish, because a link in an
 *   email that forwards to wherever its query string says is an open redirect
 *   — and the emails that carry these links are exactly what a phisher would
 *   copy. The list lives in `src/config/email.ts`.
 */

const CONFIRMATION_TYPES: readonly ConfirmationType[] = ["signup", "recovery", "email_change"];

function isConfirmationType(value: string): value is ConfirmationType {
  return (CONFIRMATION_TYPES as readonly string[]).includes(value);
}

function safeRedirect(path: string) {
  const response = NextResponse.redirect(new URL(path, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Supabase sends `token_hash`; the local provider's dev link uses the same
  // name, so one reader serves both.
  const tokenHash = params.get("token_hash") ?? "";
  const rawType = params.get("type") ?? "signup";
  const next = allowedRedirect(params.get("next"));

  if (!tokenHash || !isConfirmationType(rawType)) {
    logger.warn("Confirmation link malformed", { hasToken: Boolean(tokenHash), type: rawType });
    return safeRedirect("/login?notice=expired");
  }

  const result = await confirmTokenAction(tokenHash, rawType);

  if (!result.ok) return safeRedirect("/login?notice=expired");

  return safeRedirect(next);
}
