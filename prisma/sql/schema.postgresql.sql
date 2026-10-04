-- PostgreSQL DDL, generated from prisma/schema.prisma by scripts/generate-sql.mjs.
--
-- Do not edit by hand. Prisma Migrate is the source of truth on a machine
-- that can reach its engine download. This file exists so the schema can
-- still be created where it cannot. Regenerate with `npm run db:sql`.

CREATE TYPE "BusinessStage" AS ENUM ('IDEA', 'PRE_LAUNCH', 'EARLY_TRACTION', 'SCALING', 'ESTABLISHED');
CREATE TYPE "PrimaryGoal" AS ENUM ('AWARENESS', 'ACQUISITION', 'ACTIVATION', 'RETENTION', 'REVENUE');
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "BusinessModel" AS ENUM ('B2B', 'B2C', 'B2B2C', 'D2C', 'MARKETPLACE', 'SUBSCRIPTION', 'ECOMMERCE', 'SERVICES', 'OTHER');
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "AudienceKind" AS ENUM ('B2B', 'B2C');
CREATE TYPE "RecordSource" AS ENUM ('AI', 'MANUAL', 'EDITED', 'EXTERNAL');
CREATE TYPE "InsightKind" AS ENUM ('GAP', 'DIFFERENTIATION', 'OPPORTUNITY', 'THREAT', 'POSITIONING');
CREATE TYPE "ContentPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'FACEBOOK', 'X', 'EMAIL', 'BLOG');
CREATE TYPE "ContentType" AS ENUM ('POST', 'SHORT_VIDEO_SCRIPT', 'AD_COPY', 'EMAIL', 'ARTICLE', 'CREATIVE_BRIEF');
CREATE TYPE "ContentStatus" AS ENUM ('IDEA', 'DRAFT', 'APPROVED', 'SCHEDULED', 'PUBLISHED');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED');
CREATE TYPE "RecommendationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "RecommendationLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'ACCEPTED', 'IN_PROGRESS', 'DONE', 'DISMISSED');
CREATE TYPE "ExperimentStatus" AS ENUM ('IDEA', 'PLANNED', 'RUNNING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "WeeklyPlanStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');
CREATE TYPE "MarketingTaskStatus" AS ENUM ('TODO', 'DONE', 'SKIPPED');
CREATE TYPE "TaskPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "EvidenceConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELED');
CREATE TYPE "WebhookStatus" AS ENUM ('PROCESSED', 'IGNORED', 'FAILED');
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

CREATE TABLE IF NOT EXISTS "workspaces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workspaces_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "workspaces_ownerId_idx" ON "workspaces"("ownerId");

CREATE TABLE IF NOT EXISTS "memberships" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER'::"MembershipRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "memberships_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "memberships_userId_workspaceId_key" ON "memberships"("userId", "workspaceId");
CREATE INDEX IF NOT EXISTS "memberships_workspaceId_idx" ON "memberships"("workspaceId");

CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "audit_events_workspaceId_createdAt_idx" ON "audit_events"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_events_actorId_idx" ON "audit_events"("actorId");

CREATE TABLE IF NOT EXISTS "projects" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "targetMarkets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "businessStage" "BusinessStage" NOT NULL,
    "primaryGoal" "PrimaryGoal" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "projects_workspaceId_idx" ON "projects"("workspaceId");
CREATE INDEX IF NOT EXISTS "projects_archivedAt_idx" ON "projects"("archivedAt");
CREATE INDEX IF NOT EXISTS "projects_createdAt_idx" ON "projects"("createdAt");

CREATE TABLE IF NOT EXISTS "product_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "eventName" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "product_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "product_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "product_events_workspaceId_createdAt_idx" ON "product_events"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "product_events_eventName_createdAt_idx" ON "product_events"("eventName", "createdAt");
CREATE INDEX IF NOT EXISTS "product_events_workspaceId_eventName_createdAt_idx" ON "product_events"("workspaceId", "eventName", "createdAt");

CREATE TABLE IF NOT EXISTS "business_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "productOrService" TEXT,
    "businessModel" "BusinessModel",
    "targetCustomers" TEXT,
    "currentMarketingChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "monthlyBudgetAmount" INTEGER,
    "monthlyBudgetCurrency" TEXT,
    "currentChallenges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "knownCompetitors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "linkedinUrl" TEXT,
    "xUrl" TEXT,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "youtubeUrl" TEXT,
    "tiktokUrl" TEXT,
    "brandVoice" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "lastStep" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "business_profiles_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_profiles_projectId_key" ON "business_profiles"("projectId");

CREATE TABLE IF NOT EXISTS "agent_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "featureKey" TEXT,
    "agentType" TEXT NOT NULL,
    "inputSummary" TEXT NOT NULL,
    "output" JSONB,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING'::"AgentRunStatus",
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION,
    "idempotencyKey" TEXT,
    "promptVersion" TEXT,
    "schemaVersion" TEXT,
    CONSTRAINT "agent_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "agent_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_runs_idempotencyKey_key" ON "agent_runs"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "agent_runs_projectId_startedAt_idx" ON "agent_runs"("projectId", "startedAt");
CREATE INDEX IF NOT EXISTS "agent_runs_workspaceId_startedAt_idx" ON "agent_runs"("workspaceId", "startedAt");
CREATE INDEX IF NOT EXISTS "agent_runs_agentType_idx" ON "agent_runs"("agentType");
CREATE INDEX IF NOT EXISTS "agent_runs_status_idx" ON "agent_runs"("status");

CREATE TABLE IF NOT EXISTS "entitlements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "entitlements_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "entitlements_workspaceId_key_key" ON "entitlements"("workspaceId", "key");

CREATE TABLE IF NOT EXISTS "conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "conversations_projectId_updatedAt_idx" ON "conversations"("projectId", "updatedAt");

CREATE TABLE IF NOT EXISTS "messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

CREATE TABLE IF NOT EXISTS "strategies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "strategies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "strategies_projectId_key" ON "strategies"("projectId");
CREATE UNIQUE INDEX IF NOT EXISTS "strategies_currentVersionId_key" ON "strategies"("currentVersionId");

CREATE TABLE IF NOT EXISTS "strategy_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strategyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "missingInformation" JSONB NOT NULL,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strategy_versions_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "strategy_versions_strategyId_version_key" ON "strategy_versions"("strategyId", "version");
CREATE INDEX IF NOT EXISTS "strategy_versions_strategyId_createdAt_idx" ON "strategy_versions"("strategyId", "createdAt");

CREATE TABLE IF NOT EXISTS "audience_segments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "AudienceKind" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "painPoints" JSONB NOT NULL,
    "motivations" JSONB NOT NULL,
    "buyingTriggers" JSONB NOT NULL,
    "objections" JSONB NOT NULL,
    "preferredChannels" JSONB NOT NULL,
    "messagingAngles" JSONB NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'AI'::"RecordSource",
    "evidenceNote" TEXT,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "audience_segments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "audience_segments_projectId_priority_idx" ON "audience_segments"("projectId", "priority");

CREATE TABLE IF NOT EXISTS "icps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "segmentId" TEXT NOT NULL,
    "kind" "AudienceKind" NOT NULL,
    "attributes" JSONB NOT NULL,
    "qualifyingSignals" JSONB NOT NULL,
    "disqualifiers" JSONB NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'AI'::"RecordSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "icps_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "audience_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "icps_segmentId_key" ON "icps"("segmentId");

CREATE TABLE IF NOT EXISTS "personas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "segmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "goals" JSONB NOT NULL,
    "painPoints" JSONB NOT NULL,
    "objections" JSONB NOT NULL,
    "channels" JSONB NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'AI'::"RecordSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "personas_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "audience_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "personas_segmentId_idx" ON "personas"("segmentId");

CREATE TABLE IF NOT EXISTS "competitors" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "positioning" TEXT,
    "pricingNotes" TEXT,
    "marketingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "competitors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "competitors_projectId_createdAt_idx" ON "competitors"("projectId", "createdAt");

CREATE TABLE IF NOT EXISTS "market_insights" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" "InsightKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "unknowns" JSONB NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'AI'::"RecordSource",
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "market_insights_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "market_insights_projectId_kind_idx" ON "market_insights"("projectId", "kind");

CREATE TABLE IF NOT EXISTS "content_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "platform" "ContentPlatform" NOT NULL,
    "type" "ContentType" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'IDEA'::"ContentStatus",
    "objective" TEXT NOT NULL,
    "audience" TEXT,
    "pillar" TEXT,
    "hook" TEXT,
    "body" TEXT,
    "cta" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "source" "RecordSource" NOT NULL DEFAULT 'AI'::"RecordSource",
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "content_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "content_items_projectId_status_idx" ON "content_items"("projectId", "status");
CREATE INDEX IF NOT EXISTS "content_items_projectId_scheduledAt_idx" ON "content_items"("projectId", "scheduledAt");

CREATE TABLE IF NOT EXISTS "campaigns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "audience" TEXT,
    "offer" TEXT,
    "channels" JSONB NOT NULL,
    "totalBudgetAmount" INTEGER,
    "totalBudgetCurrency" TEXT,
    "budgetAllocation" JSONB NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "messaging" JSONB NOT NULL,
    "creativeConcept" TEXT,
    "landingPage" TEXT,
    "kpiFramework" JSONB NOT NULL,
    "funnel" JSONB NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT'::"CampaignStatus",
    "source" "RecordSource" NOT NULL DEFAULT 'AI'::"RecordSource",
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaigns_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "campaigns_projectId_status_idx" ON "campaigns"("projectId", "status");
CREATE INDEX IF NOT EXISTS "campaigns_projectId_startDate_idx" ON "campaigns"("projectId", "startDate");

CREATE TABLE IF NOT EXISTS "budget_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "period" TEXT,
    "lines" JSONB NOT NULL,
    "goal" TEXT,
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL'::"RecordSource",
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "budget_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "budget_plans_projectId_createdAt_idx" ON "budget_plans"("projectId", "createdAt");

CREATE TABLE IF NOT EXISTS "marketing_metrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "channel" TEXT NOT NULL,
    "campaign" TEXT,
    "spend" INTEGER,
    "revenue" INTEGER,
    "currency" TEXT,
    "impressions" INTEGER,
    "reach" INTEGER,
    "clicks" INTEGER,
    "leads" INTEGER,
    "conversions" INTEGER,
    "customers" INTEGER,
    "note" TEXT,
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL'::"RecordSource",
    "externalKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketing_metrics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketing_metrics_externalKey_key" ON "marketing_metrics"("externalKey");
CREATE INDEX IF NOT EXISTS "marketing_metrics_projectId_date_idx" ON "marketing_metrics"("projectId", "date");
CREATE INDEX IF NOT EXISTS "marketing_metrics_projectId_channel_idx" ON "marketing_metrics"("projectId", "channel");

CREATE TABLE IF NOT EXISTS "recommendations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "insight" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "priority" "RecommendationPriority" NOT NULL DEFAULT 'MEDIUM'::"RecommendationPriority",
    "impact" "RecommendationLevel" NOT NULL DEFAULT 'MEDIUM'::"RecommendationLevel",
    "effort" "RecommendationLevel" NOT NULL DEFAULT 'MEDIUM'::"RecommendationLevel",
    "confidence" "RecommendationLevel" NOT NULL DEFAULT 'LOW'::"RecommendationLevel",
    "confidenceReason" TEXT NOT NULL,
    "basedOn" JSONB NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN'::"RecommendationStatus",
    "source" "RecordSource" NOT NULL DEFAULT 'AI'::"RecordSource",
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recommendations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "recommendations_projectId_status_idx" ON "recommendations"("projectId", "status");
CREATE INDEX IF NOT EXISTS "recommendations_projectId_priority_idx" ON "recommendations"("projectId", "priority");

CREATE TABLE IF NOT EXISTS "experiments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "targetMetric" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "expectedResult" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "ExperimentStatus" NOT NULL DEFAULT 'IDEA'::"ExperimentStatus",
    "actualResult" TEXT,
    "learning" TEXT,
    "recommendationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "experiments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "experiments_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "experiments_projectId_status_idx" ON "experiments"("projectId", "status");

CREATE TABLE IF NOT EXISTS "settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "defaultProjectId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "settings_workspaceId_key" ON "settings"("workspaceId");

CREATE TABLE IF NOT EXISTS "weekly_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "WeeklyPlanStatus" NOT NULL DEFAULT 'ACTIVE'::"WeeklyPlanStatus",
    "weekStart" TIMESTAMP(3) NOT NULL,
    "inputHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "weekly_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "weekly_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "weekly_plans_projectId_version_key" ON "weekly_plans"("projectId", "version");
CREATE INDEX IF NOT EXISTS "weekly_plans_workspaceId_idx" ON "weekly_plans"("workspaceId");
CREATE INDEX IF NOT EXISTS "weekly_plans_projectId_status_idx" ON "weekly_plans"("projectId", "status");

CREATE TABLE IF NOT EXISTS "marketing_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "steps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "channel" TEXT NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM'::"TaskPriority",
    "expectedResult" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "MarketingTaskStatus" NOT NULL DEFAULT 'TODO'::"MarketingTaskStatus",
    "completedAt" TIMESTAMP(3),
    "completionNote" TEXT,
    "skippedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketing_tasks_planId_fkey" FOREIGN KEY ("planId") REFERENCES "weekly_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "marketing_tasks_planId_status_idx" ON "marketing_tasks"("planId", "status");
CREATE INDEX IF NOT EXISTS "marketing_tasks_planId_position_idx" ON "marketing_tasks"("planId", "position");

CREATE TABLE IF NOT EXISTS "evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "claim" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3),
    "confidence" "EvidenceConfidence" NOT NULL DEFAULT 'LOW'::"EvidenceConfidence",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "marketing_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "evidence_taskId_idx" ON "evidence"("taskId");

CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paddle',
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "priceId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING'::"SubscriptionStatus",
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "lastEventOccurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_workspaceId_key" ON "subscriptions"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_providerSubscriptionId_key" ON "subscriptions"("providerSubscriptionId");
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions"("status");

CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL DEFAULT 'paddle',
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'PROCESSED'::"WebhookStatus",
    "result" TEXT,
    "occurredAt" TIMESTAMP(3),
    "workspaceId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_providerEventId_key" ON "webhook_events"("providerEventId");
CREATE INDEX IF NOT EXISTS "webhook_events_type_receivedAt_idx" ON "webhook_events"("type", "receivedAt");
CREATE INDEX IF NOT EXISTS "webhook_events_occurredAt_idx" ON "webhook_events"("occurredAt");

CREATE TABLE IF NOT EXISTS "email_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipientHash" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'SENT'::"EmailStatus",
    "providerMessageId" TEXT,
    "error" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_messages_idempotencyKey_key" ON "email_messages"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "email_messages_template_createdAt_idx" ON "email_messages"("template", "createdAt");
CREATE INDEX IF NOT EXISTS "email_messages_recipientHash_idx" ON "email_messages"("recipientHash");

CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS "rate_limit_buckets_key_windowStart_key" ON "rate_limit_buckets"("key", "windowStart");
CREATE INDEX IF NOT EXISTS "rate_limit_buckets_windowStart_idx" ON "rate_limit_buckets"("windowStart");

CREATE TABLE IF NOT EXISTS "invites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "workspaceId" TEXT,
    "invitedById" TEXT,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING'::"InviteStatus",
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "invites_tokenHash_key" ON "invites"("tokenHash");
CREATE INDEX IF NOT EXISTS "invites_email_status_idx" ON "invites"("email", "status");
CREATE INDEX IF NOT EXISTS "invites_status_expiresAt_idx" ON "invites"("status", "expiresAt");

CREATE TABLE IF NOT EXISTS "feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "onboardingFriction" TEXT,
    "mostUseful" TEXT,
    "leastUseful" TEXT,
    "statusEase" TEXT,
    "overall" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "feedback_workspaceId_createdAt_idx" ON "feedback"("workspaceId", "createdAt");
