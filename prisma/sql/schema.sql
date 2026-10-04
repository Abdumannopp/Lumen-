-- Local development DDL, hand-written to match prisma/schema.prisma (SQLite).
--
-- Prisma Migrate is the source of truth on a normal machine
-- (`npm run db:push` or `npm run db:migrate`). This file exists only so the
-- schema can be applied where the Prisma CLI cannot reach its engine download.
--
-- SQLite has no enum or array types: enums are stored as TEXT and constrained
-- with CHECK, and lists are JSON strings decoded in src/lib/json-list.ts.

CREATE TABLE IF NOT EXISTS "projects" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "name"          TEXT NOT NULL,
    "website"       TEXT,
    "industry"      TEXT NOT NULL,
    "country"       TEXT NOT NULL,
    "targetMarkets" TEXT NOT NULL DEFAULT '[]',
    "description"   TEXT,
    "businessStage" TEXT NOT NULL,
    "primaryGoal"   TEXT NOT NULL,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     DATETIME NOT NULL,
    "archivedAt"    DATETIME
);

CREATE INDEX IF NOT EXISTS "projects_archivedAt_idx" ON "projects"("archivedAt");
CREATE INDEX IF NOT EXISTS "projects_createdAt_idx" ON "projects"("createdAt");

CREATE TABLE IF NOT EXISTS "product_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "eventName" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL,
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "product_events_workspaceId_createdAt_idx" ON "product_events"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "product_events_eventName_createdAt_idx" ON "product_events"("eventName", "createdAt");
CREATE INDEX IF NOT EXISTS "product_events_workspaceId_eventName_createdAt_idx" ON "product_events"("workspaceId", "eventName", "createdAt");

CREATE TABLE IF NOT EXISTS "business_profiles" (
    "id"                       TEXT NOT NULL PRIMARY KEY,
    "projectId"                TEXT NOT NULL,
    "productOrService"         TEXT,
    "businessModel"            TEXT,
    "targetCustomers"          TEXT,
    "currentMarketingChannels" TEXT NOT NULL DEFAULT '[]',
    "monthlyBudgetAmount"      INTEGER,
    "monthlyBudgetCurrency"    TEXT,
    "currentChallenges"        TEXT NOT NULL DEFAULT '[]',
    "knownCompetitors"         TEXT NOT NULL DEFAULT '[]',
    "linkedinUrl"              TEXT,
    "xUrl"                     TEXT,
    "instagramUrl"             TEXT,
    "facebookUrl"              TEXT,
    "youtubeUrl"               TEXT,
    "tiktokUrl"                TEXT,
    "brandVoice"               TEXT NOT NULL DEFAULT '[]',
    "notes"                    TEXT,
    "lastStep"                 INTEGER NOT NULL DEFAULT 0,
    "completedAt"              DATETIME,
    "createdAt"                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                DATETIME NOT NULL,
    CONSTRAINT "business_profiles_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_profiles_projectId_key"
    ON "business_profiles"("projectId");

CREATE TABLE IF NOT EXISTS "agent_runs" (
    "id"               TEXT NOT NULL PRIMARY KEY,
    "projectId"        TEXT NOT NULL,
    "agentType"        TEXT NOT NULL,
    "inputSummary"     TEXT NOT NULL,
    "output"           JSONB,
    "status"           TEXT NOT NULL DEFAULT 'RUNNING',
    "provider"         TEXT NOT NULL,
    "model"            TEXT NOT NULL,
    "startedAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"      DATETIME,
    "errorMessage"     TEXT,
    "promptTokens"     INTEGER,
    "completionTokens" INTEGER,
    "latencyMs"        INTEGER,
    "attempts"         INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "agent_runs_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "agent_runs_projectId_startedAt_idx" ON "agent_runs"("projectId", "startedAt");
CREATE INDEX IF NOT EXISTS "agent_runs_agentType_idx" ON "agent_runs"("agentType");
CREATE INDEX IF NOT EXISTS "agent_runs_status_idx" ON "agent_runs"("status");

CREATE TABLE IF NOT EXISTS "conversations" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "conversations_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "conversations_projectId_updatedAt_idx" ON "conversations"("projectId","updatedAt");

CREATE TABLE IF NOT EXISTS "messages" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role"           TEXT NOT NULL,
    "content"        TEXT NOT NULL,
    "structured"     JSONB,
    "agentRunId"     TEXT,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_conversationId_fkey"
        FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "messages_conversationId_createdAt_idx" ON "messages"("conversationId","createdAt");

CREATE TABLE IF NOT EXISTS "strategies" (
    "id"               TEXT NOT NULL PRIMARY KEY,
    "projectId"        TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        DATETIME NOT NULL,
    CONSTRAINT "strategies_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "strategies_projectId_key" ON "strategies"("projectId");
CREATE UNIQUE INDEX IF NOT EXISTS "strategies_currentVersionId_key" ON "strategies"("currentVersionId");

CREATE TABLE IF NOT EXISTS "strategy_versions" (
    "id"                 TEXT NOT NULL PRIMARY KEY,
    "strategyId"         TEXT NOT NULL,
    "version"            INTEGER NOT NULL,
    "note"               TEXT NOT NULL,
    "sections"           JSONB NOT NULL,
    "assumptions"        JSONB NOT NULL,
    "missingInformation" JSONB NOT NULL,
    "agentRunId"         TEXT,
    "createdAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strategy_versions_strategyId_fkey"
        FOREIGN KEY ("strategyId") REFERENCES "strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "strategy_versions_strategyId_version_key" ON "strategy_versions"("strategyId","version");
CREATE INDEX IF NOT EXISTS "strategy_versions_strategyId_createdAt_idx" ON "strategy_versions"("strategyId","createdAt");

CREATE TABLE IF NOT EXISTS "audience_segments" (
    "id"                TEXT NOT NULL PRIMARY KEY,
    "projectId"         TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "description"       TEXT NOT NULL,
    "kind"              TEXT NOT NULL,
    "priority"          INTEGER NOT NULL DEFAULT 0,
    "painPoints"        JSONB NOT NULL,
    "motivations"       JSONB NOT NULL,
    "buyingTriggers"    JSONB NOT NULL,
    "objections"        JSONB NOT NULL,
    "preferredChannels" JSONB NOT NULL,
    "messagingAngles"   JSONB NOT NULL,
    "source"            TEXT NOT NULL DEFAULT 'AI',
    "evidenceNote"      TEXT,
    "agentRunId"        TEXT,
    "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         DATETIME NOT NULL,
    CONSTRAINT "audience_segments_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "audience_segments_projectId_priority_idx" ON "audience_segments"("projectId","priority");

CREATE TABLE IF NOT EXISTS "icps" (
    "id"                TEXT NOT NULL PRIMARY KEY,
    "segmentId"         TEXT NOT NULL,
    "kind"              TEXT NOT NULL,
    "attributes"        JSONB NOT NULL,
    "qualifyingSignals" JSONB NOT NULL,
    "disqualifiers"     JSONB NOT NULL,
    "source"            TEXT NOT NULL DEFAULT 'AI',
    "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         DATETIME NOT NULL,
    CONSTRAINT "icps_segmentId_fkey"
        FOREIGN KEY ("segmentId") REFERENCES "audience_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "icps_segmentId_key" ON "icps"("segmentId");

CREATE TABLE IF NOT EXISTS "personas" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "segmentId"  TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "role"       TEXT NOT NULL,
    "snapshot"   TEXT NOT NULL,
    "goals"      JSONB NOT NULL,
    "painPoints" JSONB NOT NULL,
    "objections" JSONB NOT NULL,
    "channels"   JSONB NOT NULL,
    "source"     TEXT NOT NULL DEFAULT 'AI',
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  DATETIME NOT NULL,
    CONSTRAINT "personas_segmentId_fkey"
        FOREIGN KEY ("segmentId") REFERENCES "audience_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "personas_segmentId_idx" ON "personas"("segmentId");

CREATE TABLE IF NOT EXISTS "competitors" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "projectId"      TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "website"        TEXT,
    "description"    TEXT,
    "strengths"      JSONB NOT NULL,
    "weaknesses"     JSONB NOT NULL,
    "positioning"    TEXT,
    "pricingNotes"   TEXT,
    "marketingNotes" TEXT,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      DATETIME NOT NULL,
    CONSTRAINT "competitors_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "competitors_projectId_createdAt_idx" ON "competitors"("projectId","createdAt");

CREATE TABLE IF NOT EXISTS "market_insights" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "projectId"   TEXT NOT NULL,
    "kind"        TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "detail"      TEXT NOT NULL,
    "evidence"    JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "unknowns"    JSONB NOT NULL,
    "source"      TEXT NOT NULL DEFAULT 'AI',
    "agentRunId"  TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "market_insights_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "market_insights_projectId_kind_idx" ON "market_insights"("projectId","kind");

CREATE TABLE IF NOT EXISTS "content_items" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "projectId"   TEXT NOT NULL,
    "platform"    TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'IDEA',
    "objective"   TEXT NOT NULL,
    "audience"    TEXT,
    "pillar"      TEXT,
    "hook"        TEXT,
    "body"        TEXT,
    "cta"         TEXT,
    "scheduledAt" DATETIME,
    "source"      TEXT NOT NULL DEFAULT 'AI',
    "agentRunId"  TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "content_items_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "content_items_projectId_status_idx" ON "content_items"("projectId","status");
CREATE INDEX IF NOT EXISTS "content_items_projectId_scheduledAt_idx" ON "content_items"("projectId","scheduledAt");

CREATE TABLE IF NOT EXISTS "campaigns" (
    "id"                  TEXT NOT NULL PRIMARY KEY,
    "projectId"           TEXT NOT NULL,
    "name"                TEXT NOT NULL,
    "objective"           TEXT NOT NULL,
    "audience"            TEXT,
    "offer"               TEXT,
    "channels"            JSONB NOT NULL,
    "totalBudgetAmount"   INTEGER,
    "totalBudgetCurrency" TEXT,
    "budgetAllocation"    JSONB NOT NULL,
    "startDate"           DATETIME,
    "endDate"             DATETIME,
    "messaging"           JSONB NOT NULL,
    "creativeConcept"     TEXT,
    "landingPage"         TEXT,
    "kpiFramework"        JSONB NOT NULL,
    "funnel"              JSONB NOT NULL,
    "status"              TEXT NOT NULL DEFAULT 'DRAFT',
    "source"              TEXT NOT NULL DEFAULT 'AI',
    "agentRunId"          TEXT,
    "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           DATETIME NOT NULL,
    CONSTRAINT "campaigns_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "campaigns_projectId_status_idx" ON "campaigns"("projectId","status");
CREATE INDEX IF NOT EXISTS "campaigns_projectId_startDate_idx" ON "campaigns"("projectId","startDate");

CREATE TABLE IF NOT EXISTS "budget_plans" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "projectId"  TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "total"      INTEGER NOT NULL,
    "currency"   TEXT NOT NULL,
    "period"     TEXT,
    "lines"      JSONB NOT NULL,
    "goal"       TEXT,
    "source"     TEXT NOT NULL DEFAULT 'MANUAL',
    "agentRunId" TEXT,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  DATETIME NOT NULL,
    CONSTRAINT "budget_plans_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "budget_plans_projectId_createdAt_idx" ON "budget_plans"("projectId","createdAt");

CREATE TABLE IF NOT EXISTS "marketing_metrics" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "projectId"   TEXT NOT NULL,
    "date"        DATETIME NOT NULL,
    "channel"     TEXT NOT NULL,
    "campaign"    TEXT,
    "spend"       INTEGER,
    "revenue"     INTEGER,
    "currency"    TEXT,
    "impressions" INTEGER,
    "reach"       INTEGER,
    "clicks"      INTEGER,
    "leads"       INTEGER,
    "conversions" INTEGER,
    "customers"   INTEGER,
    "note"        TEXT,
    "source"      TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "marketing_metrics_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "marketing_metrics_projectId_date_idx" ON "marketing_metrics"("projectId","date");
CREATE INDEX IF NOT EXISTS "marketing_metrics_projectId_channel_idx" ON "marketing_metrics"("projectId","channel");

CREATE TABLE IF NOT EXISTS "recommendations" (
    "id"               TEXT NOT NULL PRIMARY KEY,
    "projectId"        TEXT NOT NULL,
    "title"            TEXT NOT NULL,
    "insight"          TEXT NOT NULL,
    "reason"           TEXT NOT NULL,
    "action"           TEXT NOT NULL,
    "priority"         TEXT NOT NULL DEFAULT 'MEDIUM',
    "impact"           TEXT NOT NULL DEFAULT 'MEDIUM',
    "effort"           TEXT NOT NULL DEFAULT 'MEDIUM',
    "confidence"       TEXT NOT NULL DEFAULT 'LOW',
    "confidenceReason" TEXT NOT NULL,
    "basedOn"          JSONB NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'OPEN',
    "source"           TEXT NOT NULL DEFAULT 'AI',
    "agentRunId"       TEXT,
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        DATETIME NOT NULL,
    CONSTRAINT "recommendations_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "recommendations_projectId_status_idx" ON "recommendations"("projectId","status");
CREATE INDEX IF NOT EXISTS "recommendations_projectId_priority_idx" ON "recommendations"("projectId","priority");

CREATE TABLE IF NOT EXISTS "experiments" (
    "id"               TEXT NOT NULL PRIMARY KEY,
    "projectId"        TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "hypothesis"       TEXT NOT NULL,
    "targetMetric"     TEXT NOT NULL,
    "action"           TEXT NOT NULL,
    "expectedResult"   TEXT,
    "startDate"        DATETIME,
    "endDate"          DATETIME,
    "status"           TEXT NOT NULL DEFAULT 'IDEA',
    "actualResult"     TEXT,
    "learning"         TEXT,
    "recommendationId" TEXT,
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        DATETIME NOT NULL,
    CONSTRAINT "experiments_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "experiments_recommendationId_fkey"
        FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "experiments_projectId_status_idx" ON "experiments"("projectId","status");

CREATE TABLE IF NOT EXISTS "settings" (
    "id"               TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "defaultProjectId" TEXT,
    "currency"         TEXT NOT NULL DEFAULT 'USD',
    "timezone"         TEXT NOT NULL DEFAULT 'UTC',
    "locale"           TEXT NOT NULL DEFAULT 'en-US',
    "theme"            TEXT NOT NULL DEFAULT 'dark',
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        DATETIME NOT NULL
);
