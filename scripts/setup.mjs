// One-command first-run setup.
//
// Creates .env if it is missing and applies the schema to the PostgreSQL
// database DATABASE_URL points at. Written so it depends on nothing but Node
// and a reachable database: no shell differences between Windows, macOS and
// Linux, and no reliance on the Prisma CLI being able to download its engine
// binary — which fails on sandboxed and air-gapped machines.
//
// Safe to run repeatedly: an existing .env is never overwritten, and every
// statement is CREATE ... IF NOT EXISTS.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Client } from "pg";

const ENV_PATH = ".env";
const SQL_PATH = "prisma/sql/schema.postgresql.sql";

const DEFAULT_ENV = `# LUMEN local configuration.
# Created automatically by \`npm run setup\`. Safe to edit.

# --- Database ----------------------------------------------------------
# PostgreSQL. There is no default: the database lives on a server, and a
# wrong guess would fail deep inside the first query instead of at boot.
#
# Free options that need no card, either of which is enough for a beta:
#   Supabase  https://supabase.com   500 MB, and the same project provides Auth
#   Neon      https://neon.com       0.5 GB, resumes on its own after idling
#
# Copy the connection string from the provider's dashboard.
DATABASE_URL=""

NEXT_PUBLIC_APP_URL="http://localhost:3000"
APP_ENV="local"
LOG_LEVEL="info"

# --- AI ----------------------------------------------------------------
# "mock" needs no key: every screen works and agents return placeholder text.
AI_PROVIDER="mock"

# For real analysis, pick one of these instead and restart.
#
# Google Gemini — free, no card, widest daily allowance.
# Key: https://aistudio.google.com/apikey
# Note: on Google's free tier your prompts may be used to improve their products.
# AI_PROVIDER="gemini"
# GOOGLE_API_KEY=""
#
# Groq — free, no card, much faster, smaller daily allowance.
# Key: https://console.groq.com/keys
# AI_PROVIDER="groq"
# GROQ_API_KEY=""
#
# OpenRouter — one key reaches hundreds of models. AI_MODEL picks which one;
# the default is a free one with its own small daily/per-minute limit.
# Key: https://openrouter.ai/keys
# AI_PROVIDER="openrouter"
# OPENROUTER_API_KEY=""
#
# Anthropic — paid.
# AI_PROVIDER="anthropic"
# ANTHROPIC_API_KEY=""

AI_TIMEOUT_MS="60000"
AI_MAX_ATTEMPTS="3"
`;

if (existsSync(ENV_PATH)) {
  console.log("• .env already exists — leaving it alone.");
} else {
  writeFileSync(ENV_PATH, DEFAULT_ENV);
  console.log("• Created .env with local defaults.");
}

// Read the URL back from the file we just ensured exists, so setup and the app
// can never disagree about which database they mean. A real environment
// variable still wins, which is what CI and `DATABASE_URL=… npm run setup` need.
const fromFile = readFileSync(ENV_PATH, "utf8")
  .split("\n")
  .find((line) => line.startsWith("DATABASE_URL"))
  ?.split("=")
  .slice(1)
  .join("=")
  .trim()
  .replace(/^["']|["']$/g, "");

const url = process.env.DATABASE_URL || fromFile;

if (!url) {
  console.error(
    "\n✗ DATABASE_URL is empty.\n" +
      "\n  Lumen needs a PostgreSQL database. Both of these are free and need no card:\n" +
      "\n    Supabase  https://supabase.com  — 500 MB, and the same project provides Auth" +
      "\n    Neon      https://neon.com      — 0.5 GB, wakes on its own after idling\n" +
      "\n  Create a database, copy its connection string into .env, and run this again.\n",
  );
  process.exit(1);
}

const client = new Client({ connectionString: url });

try {
  await client.connect();
} catch (error) {
  console.error(`\n✗ Could not reach the database: ${error.message}\n`);
  process.exit(1);
}

// Comment lines are stripped from inside each statement rather than used to
// discard it: several statements are preceded by explanatory comments, and
// dropping the whole chunk silently skipped creating the tables.
const statements = readFileSync(SQL_PATH, "utf8")
  .split(";")
  .map((chunk) =>
    chunk
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean);

for (const statement of statements) {
  try {
    await client.query(statement);
  } catch (error) {
    // CREATE ... IF NOT EXISTS covers reruns, but CREATE TYPE has no such form,
    // so an existing enum has to be recognised here instead.
    if (!/already exists/i.test(error.message)) {
      console.error("\n✗ Schema failed:", error.message);
      process.exit(1);
    }
  }
}

const tables = await client.query(
  "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
);

const host = (() => {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "the configured database";
  }
})();

console.log(`• Database ready at ${host} — ${tables.rows[0].n} tables.`);
console.log("\nNext: npm run dev   →   http://localhost:3000");

await client.end();
