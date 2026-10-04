import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FolderPlus, Layers } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ActivationCard } from "@/components/dashboard/activation-card";
import { ExecutionMomentum } from "@/components/dashboard/execution-momentum";
import { ProofOfValue } from "@/components/dashboard/proof-of-value";
import { BusinessSnapshot } from "@/components/dashboard/business-snapshot";
import {
  DashboardSection,
  SectionPlaceholder,
} from "@/components/dashboard/dashboard-section";
import { NextActions } from "@/components/dashboard/next-actions";
import { StatusCard } from "@/components/dashboard/status-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BUSINESS_STAGE_SHORT, PRIMARY_GOAL_SHORT } from "@/config/project";
import { getBusinessContext } from "@/lib/business-profile/queries";
import { buildDashboardState } from "@/lib/dashboard/state";
import { getDashboardSnapshot } from "@/lib/dashboard/queries";
import { toDayInput } from "@/lib/date";
import { countProjects, getActiveProject } from "@/lib/projects/queries";
import { getActivePlan } from "@/lib/weekly-plan/queries";
import { getExecutionMomentum } from "@/lib/dashboard/value";
import { getProofOfValue } from "@/lib/dashboard/proof-of-value";

export const metadata: Metadata = {
  title: "Overview",
};

/**
 * Overview dashboard.
 *
 * Answers two questions: what is happening with this business, and what should
 * I work on next. Everything shown is read from stored rows — where a section
 * has no data source yet it says so, because an invented "0 campaigns" reads as
 * failure rather than absence.
 */
export default async function DashboardPage() {
  const [project, counts] = await Promise.all([getActiveProject(), countProjects()]);

  if (counts.total === 0) redirect("/onboarding");

  if (!project) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Workspace"
          title="Overview"
          description="LUMEN organises everything by project. Select or restore one to continue."
        />
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No active project"
          description="Every project is archived. Restore one from the projects list, or add a new business."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button asChild>
                <Link href="/projects/new">
                  <FolderPlus />
                  New project
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/projects">Manage projects</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const context = await getBusinessContext(project.id);
  if (!context) redirect("/projects");

  const [snapshot, plan, momentum, proof] = await Promise.all([
    getDashboardSnapshot(project.id),
    getActivePlan(project.id),
    getExecutionMomentum(project.id),
    getProofOfValue(project.id),
  ]);

  const { completion, business } = context;
  const { modules, nextActions } = buildDashboardState(context, snapshot);
  const onboardingHref = `/projects/${project.id}/onboarding`;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Active project"
        title={project.name}
        description={
          business.productOrService ??
          business.description ??
          "No description recorded for this business yet."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{BUSINESS_STAGE_SHORT[business.businessStage]}</Badge>
            <Badge variant="accent">{PRIMARY_GOAL_SHORT[business.primaryGoal]}</Badge>
            {/* The quick action follows the state: finish setup, or read it. */}
            <Button asChild variant={completion.isComplete ? "outline" : "primary"}>
              <Link href={completion.isComplete ? `/projects/${project.id}/profile` : onboardingHref}>
                {completion.isComplete ? "Business profile" : "Finish profile"}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Open opportunities", value: snapshot.growth.open, detail: "Growth signals ready to review", href: "/growth" },
          { label: "Weekly progress", value: momentum.hasPlan ? `${momentum.completionRate}%` : "—", detail: momentum.hasPlan ? `${momentum.done} completed · ${momentum.total} tasks` : "Create a plan to start", href: "/plan" },
          { label: "Upcoming content", value: snapshot.content.scheduled, detail: snapshot.content.total ? `${snapshot.content.total} items on record` : "Nothing planned yet", href: "/content" },
          { label: "Active campaigns", value: snapshot.campaigns.active, detail: snapshot.campaigns.total ? `${snapshot.campaigns.total} campaigns on record` : "No campaigns yet", href: "/campaigns" },
        ].map((metric) => (
          <Link key={metric.label} href={metric.href} className="group rounded-2xl border border-border bg-card p-5 shadow-[0_8px_28px_-24px_rgba(29,39,78,0.3)] transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_18px_40px_-28px_var(--glow-violet)]">
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{metric.label}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <span className="font-display text-3xl font-semibold tracking-tight">{metric.value}</span>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
          </Link>
        ))}
      </div>

      <ActivationCard context={context} plan={plan} />

      <ExecutionMomentum momentum={momentum} />

      {!completion.isComplete && (
        <Card variant="aurora">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {completion.answered} of {completion.total} required answers recorded
              </p>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                LUMEN cannot say anything useful about this business until the profile is
                complete. It is the context every other area reads from.
              </p>
            </div>
            <Button asChild>
              <Link href={onboardingHref}>
                {completion.answered > 0 ? "Resume onboarding" : "Start onboarding"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <DashboardSection
        title="Status"
        description="Where each area of the business stands."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((state) => (
            <StatusCard key={state.id} state={state} />
          ))}
        </div>
      </DashboardSection>

      <DashboardSection
        title="Business snapshot"
        description="What is on record for this business."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={onboardingHref}>Edit</Link>
          </Button>
        }
      >
        <BusinessSnapshot context={context} />
      </DashboardSection>

      <DashboardSection
        title="Next actions"
        description="The smallest useful thing to do next."
      >
        <NextActions actions={nextActions} />
      </DashboardSection>

      <DashboardSection
        title="Recent insights"
        description="What SCOUT read from the competitors you recorded."
        action={
          snapshot.recentInsights.length > 0 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/intelligence">All insights</Link>
            </Button>
          ) : undefined
        }
      >
        {snapshot.recentInsights.length === 0 ? (
          <SectionPlaceholder
            title="No insights yet"
            description="SCOUT has no internet access — it reasons only about competitors you record, and refuses to analyse an empty set."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/intelligence">Add competitors</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {snapshot.recentInsights.map((insight) => (
              <li key={insight.id} className="space-y-1 px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{insight.kind.replace(/_/g, " ").toLowerCase()}</Badge>
                  <span className="text-sm font-medium text-foreground">{insight.title}</span>
                </div>
                <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {insight.detail}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection
        title="Active campaigns"
        description="Planning records only — LUMEN starts nothing and spends nothing."
        action={
          snapshot.campaigns.total > 0 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/campaigns">All campaigns</Link>
            </Button>
          ) : undefined
        }
      >
        {snapshot.activeCampaigns.length === 0 ? (
          <SectionPlaceholder
            title={snapshot.campaigns.total === 0 ? "No campaigns yet" : "Nothing running"}
            description={
              snapshot.campaigns.total === 0
                ? "A campaign is a coordinated push with a start, an end and a goal. None have been created."
                : `${snapshot.campaigns.total} campaign${snapshot.campaigns.total === 1 ? " is" : "s are"} recorded, but none are scheduled or active.`
            }
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/campaigns">
                  {snapshot.campaigns.total === 0 ? "Plan a campaign" : "Open campaigns"}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {snapshot.activeCampaigns.map((campaign) => (
              <li key={campaign.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <Badge variant={campaign.status === "ACTIVE" ? "accent" : "outline"}>
                  {campaign.status.toLowerCase()}
                </Badge>
                <span className="text-sm font-medium text-foreground">{campaign.name}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {campaign.objective}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection
        title="Upcoming content"
        description="Dated from today onwards. Publishing happens wherever you already publish."
        action={
          snapshot.content.total > 0 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/content/calendar">Calendar</Link>
            </Button>
          ) : undefined
        }
      >
        {snapshot.upcomingContent.length === 0 ? (
          <SectionPlaceholder
            title={snapshot.content.total === 0 ? "No content planned" : "Nothing dated ahead"}
            description={
              snapshot.content.total === 0
                ? "Ideas, drafts and scheduled pieces all live in the content module."
                : `${snapshot.content.total} piece${snapshot.content.total === 1 ? "" : "s"} on record, none dated from today onwards.`
            }
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/content">
                  {snapshot.content.total === 0 ? "Plan content" : "Open content"}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {snapshot.upcomingContent.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                  {toDayInput(item.scheduledAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {item.hook ?? item.objective}
                </span>
                <Badge variant="outline">{item.platform.replace(/_/g, " ").toLowerCase()}</Badge>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection
        title="Growth opportunities"
        description="What ASCEND thinks is worth doing next, and why."
        action={
          snapshot.growth.total > 0 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/growth">All recommendations</Link>
            </Button>
          ) : undefined
        }
      >
        {snapshot.topRecommendations.length === 0 ? (
          <SectionPlaceholder
            title="No opportunities yet"
            description={
              completion.isComplete
                ? "ASCEND reads your profile, strategy, content, campaigns and recorded results together. Ask it what to improve."
                : "Opportunities need a complete business profile before they can be worth anything."
            }
            action={
              <Button asChild variant="outline" size="sm">
                <Link href={completion.isComplete ? "/growth" : onboardingHref}>
                  {completion.isComplete ? "Find opportunities" : "Complete profile"}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {snapshot.topRecommendations.map((recommendation) => (
              <li key={recommendation.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <Badge variant={recommendation.priority === "CRITICAL" ? "accent" : "outline"}>
                  {recommendation.priority.toLowerCase()}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {recommendation.title}
                </span>
                <span className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
                  {recommendation.status.replace(/_/g, " ").toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>
    </div>
  );
}
