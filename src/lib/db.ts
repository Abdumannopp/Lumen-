import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv, isProduction } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Database client.
 *
 * PostgreSQL, reached through a Prisma 7 driver adapter rather than a bundled
 * engine. Lumen ran on a local SQLite file while it was a single-operator tool;
 * a hosted product needs a server several processes can share, and a tenant
 * model needs constraints SQLite does not enforce well.
 *
 * The pool is cached on globalThis because Next's dev server re-evaluates
 * modules on every hot reload, which would otherwise open a new pool per edit
 * and exhaust the connection limit — the free database tiers this runs on allow
 * very few.
 */

/** Host and database name only — never the credentials in the URL. */
function safeHost(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function createPrismaClient() {
  const env = getServerEnv();

  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

  const client = new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["warn", "error"],
  });

  // The URL carries the password, so only the host is ever logged.
  logger.debug("Prisma client created", { host: safeHost(env.DATABASE_URL) });

  return client;
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = db;
}

/** Cheap round-trip used by the health endpoint and container readiness probes. */
export async function checkDatabaseConnection(): Promise<{ reachable: boolean; latencyMs: number }> {
  const startedAt = performance.now();

  try {
    await db.$queryRaw`SELECT 1`;
    return { reachable: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    logger.error("Database health check failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { reachable: false, latencyMs: Math.round(performance.now() - startedAt) };
  }
}
