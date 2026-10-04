/**
 * Minimal first-party consent state used by public acquisition attribution.
 * The preference cookie itself is strictly necessary to remember a user's
 * choice; attribution remains disabled until the user opts in.
 */
export const CONSENT_COOKIE = "lumen.consent.v1";
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180;
export const ACQUISITION_CONSENT_EVENT = "lumen:consent";
