import { NextResponse, type NextRequest } from "next/server";

import { contentSecurityPolicy } from "@/config/csp";

/**
 * Per-request Content-Security-Policy with a script nonce.
 *
 * Next.js reads the nonce out of the request's CSP header while rendering and
 * attaches it to every script it injects (the framework runtime, page chunks,
 * the RSC payload). With `'strict-dynamic'`, scripts those trusted scripts load
 * — Paddle's checkout, Next's lazy chunks — are trusted too, so `script-src`
 * no longer needs `'unsafe-inline'`.
 *
 * This replaces the static policy that used to live in next.config.ts. Nonces
 * require dynamic rendering, and every HTML route in this app already renders
 * per request (see the build output), so it costs no static optimisation.
 *
 * Not authentication: access control is the Data Access Layer's job
 * (src/lib/auth/dal.ts). This file only decides response headers.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy({
    nonce,
    development: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      // API routes and static files get the static policy from next.config.ts.
      source: "/((?!api|_next/static|_next/image|favicon.ico|brand/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
