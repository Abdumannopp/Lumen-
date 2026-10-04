import type { NextConfig } from "next";

import { contentSecurityPolicy } from "./src/config/csp";

/**
 * Content-Security-Policy.
 *
 * HTML pages get a per-request nonce policy from src/proxy.ts, which no longer
 * needs `'unsafe-inline'` in `script-src`. The static policy here covers what
 * the proxy does not match — API routes — and is built by the same function in
 * src/config/csp.ts so the two cannot drift apart.
 */
const apiCsp = contentSecurityPolicy();

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
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: apiCsp }] },
    ];
  },
};

export default nextConfig;
