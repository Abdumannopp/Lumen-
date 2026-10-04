import { checkDatabaseConnection } from "@/lib/db";
import { handleRoute } from "@/lib/http";

/**
 * Liveness and readiness probe.
 *
 * Forced dynamic so it is never prerendered at build time — the build machine
 * has no database, and a cached "healthy" response would be worse than none.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const response = await handleRoute(async () => {
    const database = await checkDatabaseConnection();

    return {
      status: database.reachable ? ("healthy" as const) : ("degraded" as const),
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database },
    };
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
