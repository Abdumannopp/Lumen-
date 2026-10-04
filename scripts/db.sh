#!/usr/bin/env bash
# Query helper for the test suites.
#
# Wraps the PostgreSQL connection so the suites do not each embed a database
# client. Returns bare values, one row per line with columns joined by "|",
# matching the `psql -tAc` output the assertions were written against.
#
# Reads DATABASE_URL from the environment, falling back to .env so a suite can
# be run directly without exporting anything first.
node -e '
const { Client } = require("pg");
const fs = require("node:fs");

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  try {
    return fs
      .readFileSync(".env", "utf8")
      .split("\n")
      .find((line) => line.startsWith("DATABASE_URL"))
      ?.split("=")
      .slice(1)
      .join("=")
      .trim()
      .replace(/^["\x27]|["\x27]$/g, "");
  } catch {
    return undefined;
  }
}

const url = connectionString();

if (!url) {
  console.error("DATABASE_URL is not set and .env does not define it.");
  process.exit(1);
}

const client = new Client({ connectionString: url });

client
  .connect()
  .then(() => client.query(process.argv[1]))
  .then((result) => {
    for (const row of result.rows ?? []) {
      console.log(
        Object.values(row)
          .map((v) => (v === null ? "" : v))
          .join("|"),
      );
    }
    return client.end();
  })
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
' "$1"
