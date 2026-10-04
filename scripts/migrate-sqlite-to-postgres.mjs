// Copy an existing SQLite database into PostgreSQL.
//
//   node scripts/migrate-sqlite-to-postgres.mjs [--file prisma/lumen.db] [--dry-run]
//
// Three properties matter more than speed here.
//
// **It never touches the source.** The SQLite file is copied to a temporary
// location and the copy is what gets read, so the original is not even opened —
// no journal file, no lock, no chance of a write. If anything goes wrong the
// original database is exactly as it was and the old build still runs on it.
//
// **It is idempotent.** Every insert is ON CONFLICT (id) DO NOTHING, so an
// interrupted run is resumed by running it again rather than by cleaning up
// first. Re-running a completed migration reports zero new rows.
//
// **It verifies rather than asserts.** Row counts are compared table by table
// afterwards, and orphans are counted directly. A migration that reports
// success without checking is a migration that has not been checked.
//
// The whole copy runs in one transaction, so a failure leaves PostgreSQL
// untouched rather than half-populated.

import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { Client } from "pg";

/**
 * The old SQLite list encoding, inlined rather than imported from
 * src/lib/json-list.ts so this script depends on nothing that has to compile.
 * A corrupt value yields an empty list: losing one field is recoverable, and
 * failing the whole migration over it is not proportionate.
 */
function decodeList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === "string") : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------- config */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const SQLITE_FILE = flag("file", "prisma/lumen.db");
const DRY_RUN = args.includes("--dry-run");

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    return readFileSync(".env", "utf8")
      .split("\n")
      .find((line) => line.startsWith("DATABASE_URL"))
      ?.split("=")
      .slice(1)
      .join("=")
      .trim()
      .replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

/**
 * Tables in dependency order: a row is only inserted once whatever it points at
 * exists. Reversing this list would satisfy the constraints in the other
 * direction, which is why deletes elsewhere in the codebase walk it backwards.
 */
const TABLES = [
  { name: "projects", lists: ["targetMarkets"] },
  { name: "business_profiles", lists: ["currentMarketingChannels", "currentChallenges", "knownCompetitors", "brandVoice"] },
  { name: "agent_runs", json: ["output"] },
  { name: "conversations" },
  { name: "messages", json: ["structured"] },
  { name: "strategies" },
  { name: "strategy_versions", json: ["sections", "assumptions", "missingInformation"] },
  { name: "audience_segments", json: ["painPoints", "motivations", "buyingTriggers", "objections", "preferredChannels", "messagingAngles"] },
  { name: "icps", json: ["attributes", "qualifyingSignals", "disqualifiers"] },
  { name: "personas", json: ["goals", "painPoints", "objections", "channels"] },
  { name: "competitors", json: ["strengths", "weaknesses"] },
  { name: "market_insights", json: ["evidence", "assumptions", "unknowns"] },
  { name: "content_items" },
  { name: "campaigns", json: ["channels", "budgetAllocation", "messaging", "kpiFramework", "funnel"] },
  { name: "budget_plans", json: ["lines"] },
  { name: "marketing_metrics" },
  { name: "recommendations", json: ["basedOn"] },
  { name: "experiments" },
  { name: "settings" },
];

/** Columns SQLite stores as text but PostgreSQL types as a timestamp. */
const DATE_COLUMNS = new Set([
  "createdAt", "updatedAt", "archivedAt", "completedAt",
  "startedAt", "startDate", "endDate", "scheduledAt", "date",
]);

/* --------------------------------------------------------------------- run */

if (!existsSync(SQLITE_FILE)) {
  console.error(
    `\n✗ No SQLite database at ${SQLITE_FILE}.\n` +
      "\n  Nothing to migrate. If your database is elsewhere, pass --file <path>.\n",
  );
  process.exit(1);
}

const url = connectionString();
if (!url) {
  console.error("\n✗ DATABASE_URL is not set and .env does not define it.\n");
  process.exit(1);
}

// Read a copy, so the original is never opened by anything that could write.
const workingCopy = join(tmpdir(), `lumen-migrate-${process.pid}.db`);
copyFileSync(SQLITE_FILE, workingCopy);

const sqlite = createClient({ url: `file:${workingCopy}` });
const pg = new Client({ connectionString: url });
await pg.connect();

console.log(`• Source: ${SQLITE_FILE}`);
console.log(`• Target: ${new URL(url).host}${new URL(url).pathname}`);
if (DRY_RUN) console.log("• Dry run — nothing will be written.\n");
else console.log("");

/**
 * SQLite hands back whatever it was given. PostgreSQL is typed, so each value
 * has to arrive as the thing its column actually is.
 */
function convert(column, value, table) {
  if (value === null || value === undefined) return null;

  // Lists were JSON strings under SQLite and are text[] here.
  if (table.lists?.includes(column)) return decodeList(String(value));

  // Json columns pass through as-is; node-postgres serialises objects, and a
  // string that is already JSON is handed over unchanged.
  if (table.json?.includes(column)) {
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  if (DATE_COLUMNS.has(column)) {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new Error(`${table.name}.${column} holds an unreadable date: ${value}`);
    }
    return date.toISOString();
  }

  return value;
}

const copied = {};
const skipped = {};

/**
 * The workspace an imported install lands in.
 *
 * The old database predates workspaces entirely, so every project it holds
 * belongs to whoever ran it — one person, on one machine. That person becomes
 * the local operator here, owning a single workspace, and the authentication
 * step replaces both with a real account.
 *
 * The two constants match src/lib/workspace/current.ts on purpose: an imported
 * install and a freshly created one must agree about where the data sits, or
 * the app would create a second workspace beside the imported one and then
 * refuse to choose between them.
 */
const LOCAL_OPERATOR_ID = "local-operator";
const LOCAL_OPERATOR_EMAIL = "operator@localhost";
const LOCAL_WORKSPACE_NAME = "My workspace";

async function ensureWorkspace() {
  const existing = await pg.query(`SELECT "id" FROM "workspaces" ORDER BY "createdAt" LIMIT 1`);
  if (existing.rows.length > 0) return existing.rows[0].id;

  await pg.query(
    `INSERT INTO "users" ("id","email","updatedAt") VALUES ($1,$2,now())
     ON CONFLICT ("id") DO NOTHING`,
    [LOCAL_OPERATOR_ID, LOCAL_OPERATOR_EMAIL],
  );

  const workspace = await pg.query(
    `INSERT INTO "workspaces" ("id","name","ownerId","updatedAt")
     VALUES (gen_random_uuid()::text,$1,$2,now()) RETURNING "id"`,
    [LOCAL_WORKSPACE_NAME, LOCAL_OPERATOR_ID],
  );

  await pg.query(
    `INSERT INTO "memberships" ("id","userId","workspaceId","role","updatedAt")
     VALUES (gen_random_uuid()::text,$1,$2,'OWNER',now())`,
    [LOCAL_OPERATOR_ID, workspace.rows[0].id],
  );

  return workspace.rows[0].id;
}

try {
  await pg.query("BEGIN");

  const workspaceId = await ensureWorkspace();
  console.log(`  workspace             ${workspaceId}\n`);

  for (const table of TABLES) {
    let rows;
    try {
      const result = await sqlite.execute(`SELECT * FROM "${table.name}"`);
      rows = result.rows;
    } catch (error) {
      // A table the old database never had is not an error — it is an older
      // install that predates the feature.
      if (/no such table/i.test(error.message)) {
        console.log(`  ${table.name.padEnd(20)} — not present in the source, skipped`);
        continue;
      }
      throw error;
    }

    if (rows.length === 0) {
      copied[table.name] = 0;
      console.log(`  ${table.name.padEnd(20)} 0`);
      continue;
    }

    // The old schema had no workspace, so the column is added on the way in.
    //
    // Two tables carry it. `projects`, and `settings` — which used to be a
    // single row pinned to id "singleton" for the whole install and is now one
    // row per workspace. That row keeps its id and becomes this workspace's
    // preferences, which is what it always was in practice.
    const extra = ["projects", "settings"].includes(table.name) ? { workspaceId } : {};
    const columns = [...Object.keys(rows[0]), ...Object.keys(extra)];
    let inserted = 0;

    for (const row of rows) {
      const values = [
        ...Object.keys(rows[0]).map((c) => convert(c, row[c], table)),
        ...Object.values(extra),
      ];

      if (DRY_RUN) {
        inserted += 1;
        continue;
      }

      const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
      const quoted = columns.map((c) => `"${c}"`).join(", ");

      const result = await pg.query(
        `INSERT INTO "${table.name}" (${quoted}) VALUES (${placeholders})
         ON CONFLICT ("id") DO NOTHING`,
        values,
      );

      inserted += result.rowCount ?? 0;
    }

    copied[table.name] = inserted;
    skipped[table.name] = rows.length - inserted;

    const note = skipped[table.name] > 0 ? `  (${skipped[table.name]} already present)` : "";
    console.log(`  ${table.name.padEnd(20)} ${inserted}${note}`);
  }

  if (DRY_RUN) {
    await pg.query("ROLLBACK");
    console.log("\n• Dry run complete. Nothing was written.");
  } else {
    await pg.query("COMMIT");
    console.log("\n• Copy committed.");
  }
} catch (error) {
  await pg.query("ROLLBACK");
  console.error(`\n✗ Migration failed and was rolled back — PostgreSQL is unchanged.`);
  console.error(`  ${error.message}\n`);
  console.error(`  The SQLite file was never opened — only a copy — and is untouched.\n`);
  await pg.end();
  rmSync(workingCopy, { force: true });
  process.exit(1);
}

/* ------------------------------------------------------------ verification */

if (!DRY_RUN) {
  console.log("\n• Verifying.\n");

  let problems = 0;

  for (const table of TABLES) {
    let source;
    try {
      source = Number(
        (await sqlite.execute(`SELECT count(*) AS n FROM "${table.name}"`)).rows[0].n,
      );
    } catch {
      continue;
    }

    const target = Number(
      (await pg.query(`SELECT count(*)::int AS n FROM "${table.name}"`)).rows[0].n,
    );

    if (source !== target) {
      console.log(`  ROW COUNT  ${table.name}: SQLite ${source}, PostgreSQL ${target}`);
      problems += 1;
    }
  }

  // Every business table hangs off a project. An orphan here means a foreign key
  // that was never enforced in SQLite, which is exactly what this migration is
  // meant to surface.
  const scoped = TABLES.filter(
    (t) => !["projects", "settings", "icps", "personas", "messages", "strategy_versions"].includes(t.name),
  );

  for (const table of scoped) {
    const { rows } = await pg.query(
      `SELECT count(*)::int AS n FROM "${table.name}" t
        WHERE t."projectId" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "projects" p WHERE p."id" = t."projectId")`,
    );
    if (rows[0].n > 0) {
      console.log(`  ORPHANS    ${table.name}: ${rows[0].n} rows point at a project that does not exist`);
      problems += 1;
    }
  }

  const total = Object.values(copied).reduce((a, b) => a + b, 0);

  if (problems === 0) {
    console.log(`  Row counts match on every table. No orphans.`);
    console.log(`\n• ${total} row(s) copied. Run \`npm run db:drift\` to confirm the schema too.`);
  } else {
    console.log(`\n✗ ${problems} verification problem(s). The data is in PostgreSQL but does not match the source.`);
    await sqlite.close();
    await pg.end();
    process.exit(1);
  }
}

await sqlite.close();
await pg.end();
rmSync(workingCopy, { force: true });
