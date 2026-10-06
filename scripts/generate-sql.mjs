// Generate PostgreSQL DDL from prisma/schema.prisma.
//
// Prisma Migrate is the source of truth on a normal machine: `npm run db:migrate`
// writes a versioned migration and is what production applies. This script
// exists for the same reason the old hand-written SQLite mirror did — so the
// schema can be created where the Prisma CLI cannot download its engine binary
// (sandboxes, air-gapped machines, CI images without egress).
//
// The difference is that this one is generated rather than typed by hand, so it
// cannot quietly drift from the schema it claims to mirror. `scripts/check-drift.mjs`
// proves that by comparing a live database back against schema.prisma.
//
// It deliberately understands only the constructs this schema actually uses, and
// throws on anything else rather than emitting SQL that looks plausible and is
// wrong.

import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "prisma/schema.prisma";
const TARGET = "prisma/sql/schema.postgresql.sql";

const schema = readFileSync(SOURCE, "utf8");

const SCALARS = {
  String: "TEXT",
  Int: "INTEGER",
  Float: "DOUBLE PRECISION",
  Boolean: "BOOLEAN",
  DateTime: "TIMESTAMP(3)",
  Json: "JSONB",
};

/* ------------------------------------------------------------------ parsing */

const enums = new Map();
for (const match of schema.matchAll(/^enum\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const values = match[2]
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => /^\w+$/.test(line));
  enums.set(match[1], values);
}

const models = [];
for (const match of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const [, name, body] = match;

  const table = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name;
  const fields = [];
  const indexes = [];
  const uniques = [];
  const foreignKeys = [];

  for (const raw of body.split("\n")) {
    const line = raw.replace(/\/\/\/.*$/, "").replace(/\/\/.*$/, "").trim();
    if (!line) continue;

    const blockIndex = line.match(/^@@index\(\[([^\]]+)\]\)$/);
    if (blockIndex) {
      indexes.push(blockIndex[1].split(",").map((c) => c.trim()));
      continue;
    }

    const blockUnique = line.match(/^@@unique\(\[([^\]]+)\]\)$/);
    if (blockUnique) {
      uniques.push(blockUnique[1].split(",").map((c) => c.trim()));
      continue;
    }

    if (line.startsWith("@@")) continue;

    const field = line.match(/^(\w+)\s+([\w[\]?]+)\s*(.*)$/);
    if (!field) continue;

    const [, fieldName, rawType, attrs] = field;

    // A relation field declares the constraint; it is not a column itself.
    const relation = attrs.match(
      /@relation\(fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\](?:,\s*onDelete:\s*(\w+))?\)/,
    );
    if (relation) {
      foreignKeys.push({
        columns: relation[1].split(",").map((c) => c.trim()),
        target: rawType.replace(/[?[\]]/g, ""),
        references: relation[2].split(",").map((c) => c.trim()),
        onDelete: relation[3] ?? "Restrict",
      });
      continue;
    }

    const optional = rawType.endsWith("?");
    const list = rawType.endsWith("[]");
    const base = rawType.replace(/[?[\]]/g, "");

    // A bare list of another model is the reverse side of a relation.
    if (list && !enums.has(base) && !SCALARS[base]) continue;
    // A bare model reference with no @relation is the optional back-reference.
    if (!list && !enums.has(base) && !SCALARS[base]) continue;

    fields.push({
      name: attrs.match(/@map\("([^"]+)"\)/)?.[1] ?? fieldName,
      base,
      optional,
      list,
      isId: /@id\b/.test(attrs),
      isUnique: /@unique\b/.test(attrs),
      // Either a call like `cuid()` or a paren-free literal. Written this way
      // because a naive `[^)]*` stops at the inner paren and reports `cuid(`.
      default: attrs.match(/@default\((\w+\(\)|[^)]*)\)/)?.[1] ?? null,
    });
  }

  models.push({ name, table, fields, indexes, uniques, foreignKeys });
}

const tableOf = (modelName) => {
  const model = models.find((m) => m.name === modelName);
  if (!model) throw new Error(`Relation points at unknown model ${modelName}`);
  return model.table;
};

/* ----------------------------------------------------------------- emitting */

function sqlType(field) {
  const base = enums.has(field.base) ? `"${field.base}"` : SCALARS[field.base];
  if (!base) throw new Error(`Unhandled field type: ${field.base}`);
  return field.list ? `${base}[]` : base;
}

function sqlDefault(field) {
  const value = field.default;
  if (value === null) return "";

  // Prisma generates cuids in the client, so the column needs no server default.
  if (value === "cuid()" || value === "uuid()" || value === "autoincrement()") return "";
  if (value === "now()") return " DEFAULT CURRENT_TIMESTAMP";
  if (value === "[]") return ` DEFAULT ARRAY[]::${sqlType(field)}`;
  if (/^".*"$/.test(value)) return ` DEFAULT '${value.slice(1, -1).replace(/'/g, "''")}'`;
  if (/^-?\d+(\.\d+)?$/.test(value)) return ` DEFAULT ${value}`;
  if (/^(true|false)$/.test(value)) return ` DEFAULT ${value}`;
  if (enums.has(field.base)) return ` DEFAULT '${value}'::"${field.base}"`;

  throw new Error(`Unhandled @default(${value}) on ${field.name}`);
}

const ON_DELETE = {
  Cascade: "ON DELETE CASCADE",
  SetNull: "ON DELETE SET NULL",
  Restrict: "ON DELETE RESTRICT",
};

const out = [];

out.push(
  // No semicolons in this header. setup.mjs splits the file on ";" to get its
  // statements, so one inside a comment cuts the comment in half and feeds the
  // remainder to the database as SQL.
  "-- PostgreSQL DDL, generated from prisma/schema.prisma by scripts/generate-sql.mjs.",
  "--",
  "-- Do not edit by hand. Prisma Migrate is the source of truth on a machine",
  "-- that can reach its engine download. This file exists so the schema can",
  "-- still be created where it cannot. Regenerate with `npm run db:sql`.",
  "",
);

for (const [name, values] of enums) {
  out.push(
    `CREATE TYPE "${name}" AS ENUM (${values.map((v) => `'${v}'`).join(", ")});`,
  );
}
out.push("");

/**
 * Tables in dependency order.
 *
 * Foreign keys are declared inline, so a referenced table has to exist before
 * the one pointing at it. Following schema.prisma's model order instead broke
 * a fresh `npm run setup` as soon as a model was declared above one it
 * references (product_events before projects). Self-references are ignored;
 * a genuine cycle cannot be expressed with inline constraints, so it throws
 * rather than emitting SQL that fails halfway through.
 */
function dependencyOrder(list) {
  const byName = new Map(list.map((model) => [model.name, model]));
  const ordered = [];
  const state = new Map();

  const visit = (model, path) => {
    if (state.get(model.name) === "done") return;
    if (state.get(model.name) === "visiting") {
      throw new Error(`Foreign key cycle: ${[...path, model.name].join(" -> ")}`);
    }

    state.set(model.name, "visiting");
    for (const fk of model.foreignKeys) {
      if (fk.target === model.name) continue;
      const target = byName.get(fk.target);
      if (!target) throw new Error(`Relation points at unknown model ${fk.target}`);
      visit(target, [...path, model.name]);
    }
    state.set(model.name, "done");
    ordered.push(model);
  };

  for (const model of list) visit(model, []);
  return ordered;
}

for (const model of dependencyOrder(models)) {
  const columns = model.fields.map((field) => {
    const nullable = field.optional ? "" : " NOT NULL";
    const primary = field.isId ? " PRIMARY KEY" : "";
    return `    "${field.name}" ${sqlType(field)}${nullable}${sqlDefault(field)}${primary}`;
  });

  for (const fk of model.foreignKeys) {
    const cols = fk.columns.map((c) => `"${c}"`).join(", ");
    const refs = fk.references.map((c) => `"${c}"`).join(", ");
    columns.push(
      `    CONSTRAINT "${model.table}_${fk.columns.join("_")}_fkey" ` +
        `FOREIGN KEY (${cols}) REFERENCES "${tableOf(fk.target)}"(${refs}) ` +
        `${ON_DELETE[fk.onDelete]} ON UPDATE CASCADE`,
    );
  }

  out.push(`CREATE TABLE IF NOT EXISTS "${model.table}" (`);
  out.push(columns.join(",\n"));
  out.push(");");
  // Supabase publishes every table in `public` through its REST API, reachable
  // with the anon key that ships in the browser bundle. With RLS on and no
  // policies, that API sees nothing; the application is unaffected because it
  // connects as the table owner, which RLS does not apply to.
  out.push(`ALTER TABLE "${model.table}" ENABLE ROW LEVEL SECURITY;`);
  out.push("");

  for (const field of model.fields.filter((f) => f.isUnique)) {
    out.push(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${model.table}_${field.name}_key" ` +
        `ON "${model.table}"("${field.name}");`,
    );
  }

  for (const cols of model.uniques) {
    out.push(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${model.table}_${cols.join("_")}_key" ` +
        `ON "${model.table}"(${cols.map((c) => `"${c}"`).join(", ")});`,
    );
  }

  for (const cols of model.indexes) {
    out.push(
      `CREATE INDEX IF NOT EXISTS "${model.table}_${cols.join("_")}_idx" ` +
        `ON "${model.table}"(${cols.map((c) => `"${c}"`).join(", ")});`,
    );
  }

  out.push("");
}

writeFileSync(TARGET, out.join("\n"));

console.log(
  `• ${TARGET} — ${enums.size} enums, ${models.length} tables, ` +
    `${models.reduce((n, m) => n + m.foreignKeys.length, 0)} foreign keys.`,
);
