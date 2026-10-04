-- Lumen global launch: Google Analytics 4 + Search Console integration.
-- Refresh tokens are encrypted by the application before they reach this table.

ALTER TYPE "RecordSource" ADD VALUE IF NOT EXISTS 'EXTERNAL';

DO $$
BEGIN
  CREATE TYPE "GoogleConnectionStatus" AS ENUM ('CONNECTED', 'ERROR', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "google_connections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "status" "GoogleConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "refreshTokenEncrypted" TEXT NOT NULL,
  "scopes" JSONB NOT NULL,
  "analyticsPropertyId" TEXT,
  "analyticsPropertyName" TEXT,
  "analyticsProperties" JSONB,
  "searchConsoleSiteUrl" TEXT,
  "searchConsoleSites" JSONB,
  "lastSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_connections_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "google_connections_projectId_key"
  ON "google_connections"("projectId");

CREATE INDEX IF NOT EXISTS "google_connections_status_lastSyncAt_idx"
  ON "google_connections"("status", "lastSyncAt");

CREATE UNIQUE INDEX IF NOT EXISTS "marketing_metrics_externalKey_key"
  ON "marketing_metrics"("externalKey");
