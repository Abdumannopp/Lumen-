-- Baseline: the full schema as of the 2026-10-04 migrations below.
-- Generated with: prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
-- The later 20261004_* migrations are idempotent and become no-ops after this.
-- A database created earlier with 'npm run setup' or 'db push' already has
-- this schema: mark it applied instead of running it:
--   npx prisma migrate resolve --applied 20261001000000_baseline

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BusinessStage" AS ENUM ('IDEA', 'PRE_LAUNCH', 'EARLY_TRACTION', 'SCALING', 'ESTABLISHED');

-- CreateEnum
CREATE TYPE "PrimaryGoal" AS ENUM ('AWARENESS', 'ACQUISITION', 'ACTIVATION', 'RETENTION', 'REVENUE');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "BusinessModel" AS ENUM ('B2B', 'B2C', 'B2B2C', 'D2C', 'MARKETPLACE', 'SUBSCRIPTION', 'ECOMMERCE', 'SERVICES', 'OTHER');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AudienceKind" AS ENUM ('B2B', 'B2C');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('AI', 'MANUAL', 'EDITED', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "GoogleConnectionStatus" AS ENUM ('CONNECTED', 'ERROR', 'REVOKED');

-- CreateEnum
CREATE TYPE "InsightKind" AS ENUM ('GAP', 'DIFFERENTIATION', 'OPPORTUNITY', 'THREAT', 'POSITIONING');

-- CreateEnum
CREATE TYPE "ContentPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE', 'FACEBOOK', 'X', 'EMAIL', 'BLOG');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('POST', 'SHORT_VIDEO_SCRIPT', 'AD_COPY', 'EMAIL', 'ARTICLE', 'CREATIVE_BRIEF');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('IDEA', 'DRAFT', 'APPROVED', 'SCHEDULED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RecommendationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RecommendationLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'ACCEPTED', 'IN_PROGRESS', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('IDEA', 'PLANNED', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WeeklyPlanStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "MarketingTaskStatus" AS ENUM ('TODO', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "EvidenceConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "subjectType" TEXT,
    "subjectId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "eventName" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "targetMarkets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "businessStage" "BusinessStage" NOT NULL,
    "primaryGoal" "PrimaryGoal" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_profiles" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "productOrService" TEXT,
    "businessModel" "BusinessModel",
    "targetCustomers" TEXT,
    "currentMarketingChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "monthlyBudgetAmount" INTEGER,
    "monthlyBudgetCurrency" TEXT,
    "currentChallenges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "knownCompetitors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "linkedinUrl" TEXT,
    "xUrl" TEXT,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "youtubeUrl" TEXT,
    "tiktokUrl" TEXT,
    "brandVoice" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "lastStep" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "featureKey" TEXT,
    "agentType" TEXT NOT NULL,
    "inputSummary" TEXT NOT NULL,
    "output" JSONB,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
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

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategies" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_versions" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "missingInformation" JSONB NOT NULL,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audience_segments" (
    "id" TEXT NOT NULL,
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
    "source" "RecordSource" NOT NULL DEFAULT 'AI',
    "evidenceNote" TEXT,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audience_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icps" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "kind" "AudienceKind" NOT NULL,
    "attributes" JSONB NOT NULL,
    "qualifyingSignals" JSONB NOT NULL,
    "disqualifiers" JSONB NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'AI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personas" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "goals" JSONB NOT NULL,
    "painPoints" JSONB NOT NULL,
    "objections" JSONB NOT NULL,
    "channels" JSONB NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'AI',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_insights" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "InsightKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "unknowns" JSONB NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'AI',
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platform" "ContentPlatform" NOT NULL,
    "type" "ContentType" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'IDEA',
    "objective" TEXT NOT NULL,
    "audience" TEXT,
    "pillar" TEXT,
    "hook" TEXT,
    "body" TEXT,
    "cta" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "source" "RecordSource" NOT NULL DEFAULT 'AI',
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
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
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "RecordSource" NOT NULL DEFAULT 'AI',
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_plans" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "period" TEXT,
    "lines" JSONB NOT NULL,
    "goal" TEXT,
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_metrics" (
    "id" TEXT NOT NULL,
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
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
    "externalKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "insight" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "priority" "RecommendationPriority" NOT NULL DEFAULT 'MEDIUM',
    "impact" "RecommendationLevel" NOT NULL DEFAULT 'MEDIUM',
    "effort" "RecommendationLevel" NOT NULL DEFAULT 'MEDIUM',
    "confidence" "RecommendationLevel" NOT NULL DEFAULT 'LOW',
    "confidenceReason" TEXT NOT NULL,
    "basedOn" JSONB NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "source" "RecordSource" NOT NULL DEFAULT 'AI',
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "targetMetric" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "expectedResult" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "ExperimentStatus" NOT NULL DEFAULT 'IDEA',
    "actualResult" TEXT,
    "learning" TEXT,
    "recommendationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_connections" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "google_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "defaultProjectId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_plans" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "WeeklyPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "weekStart" TIMESTAMP(3) NOT NULL,
    "inputHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_tasks" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channel" TEXT NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "expectedResult" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "MarketingTaskStatus" NOT NULL DEFAULT 'TODO',
    "completedAt" TIMESTAMP(3),
    "completionNote" TEXT,
    "skippedAt" TIMESTAMP(3),
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "claim" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3),
    "confidence" "EvidenceConfidence" NOT NULL DEFAULT 'LOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paddle',
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "priceId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "lastEventOccurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paddle',
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'PROCESSED',
    "result" TEXT,
    "occurredAt" TIMESTAMP(3),
    "workspaceId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "recipientHash" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'SENT',
    "providerMessageId" TEXT,
    "error" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "workspaceId" TEXT,
    "invitedById" TEXT,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "onboardingFriction" TEXT,
    "mostUseful" TEXT,
    "leastUseful" TEXT,
    "statusEase" TEXT,
    "overall" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "workspaces_ownerId_idx" ON "workspaces"("ownerId");

-- CreateIndex
CREATE INDEX "memberships_workspaceId_idx" ON "memberships"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_workspaceId_key" ON "memberships"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "audit_events_workspaceId_createdAt_idx" ON "audit_events"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_actorId_idx" ON "audit_events"("actorId");

-- CreateIndex
CREATE INDEX "product_events_workspaceId_createdAt_idx" ON "product_events"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "product_events_eventName_createdAt_idx" ON "product_events"("eventName", "createdAt");

-- CreateIndex
CREATE INDEX "product_events_workspaceId_eventName_createdAt_idx" ON "product_events"("workspaceId", "eventName", "createdAt");

-- CreateIndex
CREATE INDEX "projects_workspaceId_idx" ON "projects"("workspaceId");

-- CreateIndex
CREATE INDEX "projects_archivedAt_idx" ON "projects"("archivedAt");

-- CreateIndex
CREATE INDEX "projects_createdAt_idx" ON "projects"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "business_profiles_projectId_key" ON "business_profiles"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_idempotencyKey_key" ON "agent_runs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "agent_runs_projectId_startedAt_idx" ON "agent_runs"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "agent_runs_workspaceId_startedAt_idx" ON "agent_runs"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "agent_runs_agentType_idx" ON "agent_runs"("agentType");

-- CreateIndex
CREATE INDEX "agent_runs_status_idx" ON "agent_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_workspaceId_key_key" ON "entitlements"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "conversations_projectId_updatedAt_idx" ON "conversations"("projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "strategies_projectId_key" ON "strategies"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "strategies_currentVersionId_key" ON "strategies"("currentVersionId");

-- CreateIndex
CREATE INDEX "strategy_versions_strategyId_createdAt_idx" ON "strategy_versions"("strategyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_versions_strategyId_version_key" ON "strategy_versions"("strategyId", "version");

-- CreateIndex
CREATE INDEX "audience_segments_projectId_priority_idx" ON "audience_segments"("projectId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "icps_segmentId_key" ON "icps"("segmentId");

-- CreateIndex
CREATE INDEX "personas_segmentId_idx" ON "personas"("segmentId");

-- CreateIndex
CREATE INDEX "competitors_projectId_createdAt_idx" ON "competitors"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "market_insights_projectId_kind_idx" ON "market_insights"("projectId", "kind");

-- CreateIndex
CREATE INDEX "content_items_projectId_status_idx" ON "content_items"("projectId", "status");

-- CreateIndex
CREATE INDEX "content_items_projectId_scheduledAt_idx" ON "content_items"("projectId", "scheduledAt");

-- CreateIndex
CREATE INDEX "campaigns_projectId_status_idx" ON "campaigns"("projectId", "status");

-- CreateIndex
CREATE INDEX "campaigns_projectId_startDate_idx" ON "campaigns"("projectId", "startDate");

-- CreateIndex
CREATE INDEX "budget_plans_projectId_createdAt_idx" ON "budget_plans"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_metrics_externalKey_key" ON "marketing_metrics"("externalKey");

-- CreateIndex
CREATE INDEX "marketing_metrics_projectId_date_idx" ON "marketing_metrics"("projectId", "date");

-- CreateIndex
CREATE INDEX "marketing_metrics_projectId_channel_idx" ON "marketing_metrics"("projectId", "channel");

-- CreateIndex
CREATE INDEX "recommendations_projectId_status_idx" ON "recommendations"("projectId", "status");

-- CreateIndex
CREATE INDEX "recommendations_projectId_priority_idx" ON "recommendations"("projectId", "priority");

-- CreateIndex
CREATE INDEX "experiments_projectId_status_idx" ON "experiments"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "google_connections_projectId_key" ON "google_connections"("projectId");

-- CreateIndex
CREATE INDEX "google_connections_status_lastSyncAt_idx" ON "google_connections"("status", "lastSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "settings_workspaceId_key" ON "settings"("workspaceId");

-- CreateIndex
CREATE INDEX "weekly_plans_workspaceId_idx" ON "weekly_plans"("workspaceId");

-- CreateIndex
CREATE INDEX "weekly_plans_projectId_status_idx" ON "weekly_plans"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_plans_projectId_version_key" ON "weekly_plans"("projectId", "version");

-- CreateIndex
CREATE INDEX "marketing_tasks_planId_status_idx" ON "marketing_tasks"("planId", "status");

-- CreateIndex
CREATE INDEX "marketing_tasks_planId_position_idx" ON "marketing_tasks"("planId", "position");

-- CreateIndex
CREATE INDEX "evidence_taskId_idx" ON "evidence"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_workspaceId_key" ON "subscriptions"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_providerSubscriptionId_key" ON "subscriptions"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_providerEventId_key" ON "webhook_events"("providerEventId");

-- CreateIndex
CREATE INDEX "webhook_events_type_receivedAt_idx" ON "webhook_events"("type", "receivedAt");

-- CreateIndex
CREATE INDEX "webhook_events_occurredAt_idx" ON "webhook_events"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_idempotencyKey_key" ON "email_messages"("idempotencyKey");

-- CreateIndex
CREATE INDEX "email_messages_template_createdAt_idx" ON "email_messages"("template", "createdAt");

-- CreateIndex
CREATE INDEX "email_messages_recipientHash_idx" ON "email_messages"("recipientHash");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_windowStart_idx" ON "rate_limit_buckets"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_buckets_key_windowStart_key" ON "rate_limit_buckets"("key", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "invites_tokenHash_key" ON "invites"("tokenHash");

-- CreateIndex
CREATE INDEX "invites_email_status_idx" ON "invites"("email", "status");

-- CreateIndex
CREATE INDEX "invites_status_expiresAt_idx" ON "invites"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "feedback_workspaceId_createdAt_idx" ON "feedback"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icps" ADD CONSTRAINT "icps_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "audience_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "audience_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_insights" ADD CONSTRAINT "market_insights_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_metrics" ADD CONSTRAINT "marketing_metrics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_tasks" ADD CONSTRAINT "marketing_tasks_planId_fkey" FOREIGN KEY ("planId") REFERENCES "weekly_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "marketing_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

