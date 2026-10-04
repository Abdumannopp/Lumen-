import { readFileSync } from "node:fs";
import { defineConfig } from "@prisma/config";

/**
 * Prisma CLI configuration.
 *
 * The connection URL lives here (Prisma 7 no longer permits it in the schema),
 * and the runtime client connects separately through the libSQL driver adapter
 * in `src/lib/db.ts`.
 *
 * `.env` is read explicitly: when a Prisma config file is present the CLI does
 * not load it automatically, so `prisma db push` would otherwise fail with
 * "datasource.url is required" even though the variable is set in the file
 * right next to it.
 */
function loadEnvFile() {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;

      const [, key, rawValue] = match;
      // Real values win over the file, so `DATABASE_URL=… npx prisma …` works.
      if (process.env[key] !== undefined) continue;

      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env yet — the default below keeps first-run commands working.
  }
}

loadEnvFile();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // No fallback: a guessed PostgreSQL URL would either fail obscurely or, far
    // worse, reach a database that is not the one intended.
    url: process.env.DATABASE_URL ?? "",
  },
});
