/**
 * The emails Lumen sends, and where its links may point.
 *
 * Two lists, and both are deliberately short.
 *
 * Lumen sends almost no email. Signup confirmation and password reset belong to
 * the identity provider; what is left is a welcome message and one security
 * notification. A product that emails more than that is usually emailing
 * instead of being useful.
 */

/** Every template, named once so the log and the sender cannot disagree. */
export const TEMPLATES = {
  welcome: "welcome",
  passwordChanged: "password-changed",
} as const;

export type TemplateKey = (typeof TEMPLATES)[keyof typeof TEMPLATES];

/**
 * Where a link in an email may send someone.
 *
 * An allowlist of exact paths rather than "any path on our own domain", which
 * is what this used to be. The difference matters because a confirmation link
 * is the one URL a person will click without reading: an open `next` parameter
 * turns our domain into a redirector, and a redirector on the domain that sends
 * password-reset emails is a phishing kit with our name on it.
 *
 * Adding a path here is a deliberate act. That is the point.
 */
export const REDIRECT_ALLOWLIST = [
  "/overview",
  "/plan",
  "/update-password",
  "/settings",
  "/onboarding",
] as const;

export const DEFAULT_REDIRECT = "/overview";

/**
 * Resolve a `next` parameter against the allowlist.
 *
 * Anything not on the list resolves to the default rather than being refused,
 * because a person who followed a link from their inbox should land somewhere
 * useful rather than on an error — the link is still valid, only its
 * destination was not one we publish.
 */
export function allowedRedirect(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_REDIRECT;

  // Compared without a query string, so /update-password?foo=bar is allowed and
  // //evil.com and /\evil.com are not — neither survives the exact match.
  const path = raw.split("?")[0].split("#")[0];

  return (REDIRECT_ALLOWLIST as readonly string[]).includes(path) ? raw : DEFAULT_REDIRECT;
}
