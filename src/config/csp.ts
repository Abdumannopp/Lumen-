/**
 * Content-Security-Policy, built in one place for both callers:
 *
 *   src/proxy.ts      every HTML page, with a fresh per-request nonce
 *   next.config.ts    API routes, which render no HTML and need no nonce
 *
 * Supabase (identity) and Paddle (checkout) are the only outside hosts the
 * browser ever talks to; every AI provider call is server-side.
 *
 * `script-src` uses a nonce plus `'strict-dynamic'`: Next.js stamps the nonce
 * on the scripts it injects, and anything those scripts load (Paddle's
 * checkout script, lazily loaded chunks) inherits the trust. The Paddle host
 * stays listed for browsers without `'strict-dynamic'` support, which fall
 * back to the host allowlist. Development additionally needs `'unsafe-eval'`,
 * which React uses there to rebuild server error stacks; production does not.
 *
 * `style-src` keeps `'unsafe-inline'` deliberately: Radix UI positions its
 * portals and popovers by writing the `style` attribute from JavaScript, which
 * CSP treats as inline style. Style injection is a far smaller vector than
 * script injection, and blocking it would break every menu and dialog.
 *
 * `*.paddle.com` and `*.supabase.co` are wildcards because Paddle documents no
 * exact checkout subdomains and a Supabase project URL is unknown until a
 * deployment sets it.
 */
export function contentSecurityPolicy(options: { nonce?: string; development?: boolean } = {}): string {
  const scriptSrc = options.nonce
    ? ["'self'", `'nonce-${options.nonce}'`, "'strict-dynamic'", "https://cdn.paddle.com"]
    : ["'self'"];

  if (options.development) scriptSrc.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
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
}
