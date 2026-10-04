import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * Auth and third-party scripts are known now — Supabase for identity, Paddle
 * for checkout, both optional and both the only outside hosts this product
 * ever talks to from the browser (every AI provider call is server-side; see
 * the note on `AI_PROVIDER` in `src/lib/env.ts`). That is what unblocked this:
 * a CSP is only worth shipping once it can name what belongs, and until now
 * this file said a placeholder naming nothing would be worse than no header
 * at all, because it would look like coverage that was not there.
 *
 * `script-src` includes `'unsafe-inline'`. That was not the first draft: a
 * stricter `script-src 'self' https://cdn.paddle.com` was written and — per
 * this project's own rule against unverified claims — checked with a real
 * Playwright-driven Chromium against a running build before being trusted.
 * It failed outright: Next.js's App Router injects its own hydration payload
 * as inline `<script>` tags whose content differs per request, so it can be
 * allowed neither by `'unsafe-inline'`'s absence nor by a static hash, and
 * every page threw `Refused to execute inline script...` plus a React #412
 * hydration error. Next.js's own documentation
 * (https://nextjs.org/docs/app/guides/content-security-policy) confirms
 * this and gives exactly two ways out: a per-request nonce threaded through
 * middleware, which Next.js then auto-applies to its own injected scripts —
 * or `'unsafe-inline'` in `script-src`, which is what its documented
 * "without nonces" example uses for a static `next.config` header. The nonce
 * route is the stronger CSP, but it forces every page that uses it into
 * dynamic rendering, giving up static optimization, ISR, and Partial
 * Prerendering — a bigger architectural change than this hardening pass is
 * scoped for. `'unsafe-inline'` was chosen instead, matching Next.js's own
 * fallback, so `script-src` here is weaker against injected `<script>` tags
 * than `style-src` is against injected `style` attributes — but
 * `frame-ancestors`, `object-src`, `base-uri`, `form-action`, and the
 * allowed external hosts still hold. Revisit with the nonce approach if this
 * product later needs a strict script-src badly enough to pay the
 * dynamic-rendering cost.
 *
 * `style-src` does allow it, deliberately: Radix UI (`@radix-ui/react-dialog`
 * and friends) positions its portals and popovers by setting the `style`
 * attribute from JavaScript, which CSP treats the same as an inline
 * `<style>` block. Blocking that would not stop an attacker so much as break
 * every menu and dialog in the product — style-based injection is a real but
 * much smaller vector than script-based injection, and this is the standard
 * trade-off most production CSPs make for exactly that reason.
 *
 * `*.paddle.com` and `*.supabase.co` are wildcarded rather than naming exact
 * subdomains: Paddle's own documentation names `cdn.paddle.com` for the
 * script and nothing else for the checkout overlay's iframe or network
 * calls, and a Supabase project's URL is `<project-ref>.supabase.co`, unknown
 * until a deployment sets it. Both are still real restrictions — an
 * unrelated domain gains nothing from either wildcard — and both are looser
 * than ideal for the same reason the placeholder was rejected before: naming
 * the exact subdomains would require documentation that does not exist to
 * check them against. Confirm the exact Paddle checkout domains against a
 * real sandbox transaction before relying on this being tighter than it is.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.paddle.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.paddle.com https://*.supabase.co",
  "frame-src https://*.paddle.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Security headers are applied globally rather than per-route so a new page
 * cannot ship without them.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Content-Security-Policy", value: csp },
  /**
   * Sent unconditionally, including over plain HTTP in local development.
   * That is safe — the header only has an effect once a browser has loaded
   * the page over HTTPS at least once, and this deployment's own local
   * traffic is on `localhost`, which browsers treat as a secure context
   * regardless. `preload` is left off: that flag asks browsers to ship this
   * domain baked into Chromium/Firefox itself, which is a one-way door
   * (removal takes months to propagate) and not this project's call to make
   * before it has a stable production domain.
   */
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Prisma's generated client and its driver adapter must not be traced into
  // the client bundle. The adapter named here has to be the one actually
  // loaded by src/lib/db.ts.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
