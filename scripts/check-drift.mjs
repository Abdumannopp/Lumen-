// Compare a live PostgreSQL database against prisma/schema.prisma.
//
// The DDL in prisma/sql/ is generated, not hand-written, but "generated" only
// means the drift is systematic rather than accidental — a bug in the generator
// produces a database that is wrong everywhere, consistently. This reads the
// database back through information_schema and checks it against the schema it
// claims to implement.
//
// Run it after applying the DDL, and after any migration. It exits non-zero on
// the first disagreement so it can gate a release.
//
//   node scripts/check-drift.mjs

import { readFileSync } from "node:fs";
import { Client } from "pg";

const schema = readFileSync("prisma/schema.prisma", "utf8");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

/* Prisma scalar -> the udt_name PostgreSQL reports for it. */
const SCALARS = {
  String: "text",
  Int: "int4",
  Float: "float8",
  Boolean: "bool",
  DateTime: "timestamp",
  Json: "jsonb",
};

const enums = new Set([...schema.matchAll(/^enum\s+(\w+)/gm)].map((m) => m[1]));

const models = [];
for (const match of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const [, name, body] = match;
  const table = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? name;
  const fields = [];

  for (const raw of body.split("\n")) {
    const line = raw.replace(/\/\/\/.*$/, "").replace(/\/\/.*$/, "").trim();
    if (!line || line.startsWith("@@")) continue;

    const field = line.match(/^(\w+)\s+([\w[\]?]+)\s*(.*)$/);
    if (!field) continue;

    const [, fieldName, rawType, attrs] = field;
    if (/@relation\(/.test(attrs)) continue;

    const base = rawType.replace(/[?[\]]/g, "");
    if (!enums.has(base) && !SCALARS[base]) continue;

    fields.push({
      name: attrs.match(/@map\("([^"]+)"\)/)?.[1] ?? fieldName,
      base,
      optional: rawType.endsWith("?"),
      list: rawType.endsWith("[]"),
    });
  }

  models.push({ name, table, fields });
}

const client = new Client({ connectionString: url });
await client.connect();

const { rows } = await client.query(`
  SELECT table_name, column_name, is_nullable, data_type, udt_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
`);

const actual = new Map();
for (const row of rows) {
  if (!actual.has(row.table_name)) actual.set(row.table_name, new Map());
  actual.get(row.table_name).set(row.column_name, row);
}

let problems = 0;
const report = (message) => {
  console.log(`  ${message}`);
  problems += 1;
};

for (const model of models) {
  const columns = actual.get(model.table);

  if (!columns) {
    report(`MISSING TABLE  ${model.table} (model ${model.name})`);
    continue;
  }

  for (const field of model.fields) {
    const column = columns.get(field.name);

    if (!column) {
      report(`MISSING COLUMN ${model.table}.${field.name}`);
      continue;
    }

    // A list column reports data_type ARRAY with udt_name "_text".
    const expected = enums.has(field.base) ? field.base : SCALARS[field.base];
    const got = column.udt_name.replace(/^_/, "");

    if (field.list && column.data_type !== "ARRAY") {
      report(`NOT A LIST     ${model.table}.${field.name} — schema says ${field.base}[], database says ${column.data_type}`);
    }
    if (!field.list && column.data_type === "ARRAY") {
      report(`UNEXPECTED LIST ${model.table}.${field.name}`);
    }
    if (got !== expected) {
      report(`TYPE           ${model.table}.${field.name} — schema ${expected}, database ${got}`);
    }

    const nullable = column.is_nullable === "YES";
    if (field.optional !== nullable) {
      report(
        `NULLABILITY    ${model.table}.${field.name} — schema ${field.optional ? "optional" : "required"}, database ${nullable ? "nullable" : "NOT NULL"}`,
      );
    }
  }

  const expectedNames = new Set(model.fields.map((f) => f.name));
  for (const name of columns.keys()) {
    if (!expectedNames.has(name)) {
      report(`EXTRA COLUMN   ${model.table}.${name} — in the database, not in the schema`);
    }
  }
}

for (const table of actual.keys()) {
  if (!models.some((m) => m.table === table) && table !== "_prisma_migrations") {
    report(`EXTRA TABLE    ${table} — in the database, not in the schema`);
  }
}

await client.end();

if (problems === 0) {
  console.log(`• No drift. ${models.length} tables match prisma/schema.prisma.`);
} else {
  console.log(`\n${problems} disagreement(s) between the database and the schema.`);
  process.exit(1);
}
