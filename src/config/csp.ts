import cspHashes from "./csp-hashes.json";

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
 * Styles are split by kind, because the two kinds carry different risk:
 *
 *   style-src-elem   <style> and <link rel=stylesheet>: the nonce, plus the
 *                    content hashes of the few stylesheets a library injects
 *                    itself (src/config/csp-hashes.json, regenerated on every
 *                    build by scripts/csp-hashes.mjs). An injected <style>
 *                    block — the vector for CSS selector-based data
 *                    exfiltration — is refused.
 *   style-src-attr   `style="..."` attributes: `'unsafe-inline'`. React
 *                    server-renders the `style` prop as an attribute, and
 *                    Radix UI positions every menu, popover and dialog that
 *                    way. An attribute holds declarations only, never
 *                    selectors, so it cannot read anything from the page.
 *
 * `style-src` repeats the element rules as the fallback for browsers that
 * predate the -elem/-attr split; there `'unsafe-inline'` is listed too and is
 * ignored by any browser that understands nonces.
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

  // Without a nonce (API responses, which render no HTML) there is nothing to
  // allow but same-origin stylesheets.
  const styleElem = options.nonce
    ? ["'self'", `'nonce-${options.nonce}'`, ...cspHashes.styleElem]
    : ["'self'"];

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    `style-src ${[...styleElem, "'unsafe-inline'"].join(" ")}`,
    `style-src-elem ${styleElem.join(" ")}`,
    "style-src-attr 'unsafe-inline'",
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
