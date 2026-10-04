#!/usr/bin/env node
/**
 * Production launch gate. Never prints secret values; it reports only whether
 * a required setting is present and whether it matches the expected shape.
 */

const env = process.env;
const failures = [];
const warnings = [];

function requireValue(name, predicate, message) {
  const value = env[name];
  if (!value || (predicate && !predicate(value))) failures.push(`${name}: ${message}`);
}

function warn(name, predicate, message) {
  const value = env[name];
  if (value && predicate(value)) warnings.push(`${name}: ${message}`);
}

const production = env.APP_ENV === "production";
if (!production) failures.push('APP_ENV must be "production" for the final launch gate.');

requireValue("NEXT_PUBLIC_APP_URL", (v) => /^https:\/\//.test(v), "must be an HTTPS public URL.");
requireValue("DATABASE_URL", (v) => /^postgresql?:\/\//.test(v), "must be a PostgreSQL connection URL.");
requireValue("TRUST_PROXY_HEADERS", (v) => v === "true", "must be true and the proxy must sanitize forwarding headers.");
requireValue("AUTH_PROVIDER", (v) => v === "supabase", 'must be "supabase".');
requireValue("NEXT_PUBLIC_SUPABASE_URL", (v) => /^https:\/\//.test(v), "must be configured.");
requireValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", null, "must be configured.");
requireValue("AI_PROVIDER", (v) => v !== "mock", "must use a real provider, not mock.");
requireValue("EMAIL_PROVIDER", (v) => v === "resend", 'must be "resend".');
requireValue("RESEND_API_KEY", null, "must be configured.");
requireValue("EMAIL_FROM", (v) => /@/.test(v), "must be a verified sender address.");
requireValue("PADDLE_PRICE_ID", (v) => v.startsWith("pri_"), "must be a Paddle price ID.");
requireValue("PADDLE_NOTIFICATION_SECRET", (v) => v.startsWith("pdl_ntfset_"), "must be a Paddle notification secret.");
requireValue("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", (v) => v.startsWith("live_"), "must be a live Paddle client token.");
requireValue("PADDLE_ENVIRONMENT", (v) => v === "production", 'must be "production".');
requireValue("NEXT_PUBLIC_PADDLE_ENVIRONMENT", (v) => v === "production", 'must be "production".');
requireValue("SUPPORT_EMAIL", (v) => /@/.test(v) && !v.endsWith(".local"), "must be a real support address.");
requireValue("FOUNDER_EMAILS", (v) => v.split(",").some((x) => /@/.test(x.trim())), "must include at least one founder address.");

warn("SKIP_ENV_VALIDATION", (v) => v === "1", "must be unset on the running production instance.");
warn("BETA_SIGNUP", (v) => v === "invite", "invite-only mode is enabled; switch to open when the public gate is ready.");
if (!env.PADDLE_API_KEY) warnings.push("PADDLE_API_KEY: not configured; customer portal management will be unavailable.");
if (env.NEXT_PUBLIC_APP_URL && /localhost|127\.0\.0\.1/.test(env.NEXT_PUBLIC_APP_URL)) warnings.push("NEXT_PUBLIC_APP_URL: points to a local host; replace it with the production domain.");

const aiKeyMap = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GOOGLE_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};
const aiKey = aiKeyMap[env.AI_PROVIDER];
if (aiKey && !env[aiKey]) failures.push(`${aiKey}: required for AI_PROVIDER=${env.AI_PROVIDER}.`);

if (env.PADDLE_API_KEY && !/^pdl_live_apikey_/.test(env.PADDLE_API_KEY)) {
  failures.push("PADDLE_API_KEY: production API key has an unexpected prefix.");
}

console.log("LUMEN GLOBAL LAUNCH PREFLIGHT");
console.log("Environment: production");
console.log(`Checks: ${failures.length ? "FAIL" : "PASS"}`);
for (const warning of warnings) console.log(`WARN  ${warning}`);
for (const failure of failures) console.log(`FAIL  ${failure}`);

if (failures.length) process.exit(1);
console.log("READY  Production configuration passed the static launch gate.");
