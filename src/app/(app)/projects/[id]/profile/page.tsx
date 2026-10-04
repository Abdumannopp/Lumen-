import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink, Pencil } from "lucide-react";

import {
  BUSINESS_MODEL_SHORT,
  brandVoiceLabel,
  challengeLabel,
  channelLabel,
} from "@/config/business-profile";
import {
  BUSINESS_STAGE_SHORT,
  PRIMARY_GOAL_SHORT,
  countryLabel,
  industryLabel,
  marketLabel,
} from "@/config/project";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBusinessContext } from "@/lib/business-profile/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const context = await getBusinessContext(id);
  if (!context) notFound();
  return { title: `Profile · ${context.project.name}` };
}

/** Label + value row. Renders a placeholder rather than collapsing, so a gap
    in the profile is visible instead of invisible. */
function Detail({ label, children }: { label: string; children?: React.ReactNode }) {
  const empty = children === null || children === undefined || children === "";

  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className={empty ? "text-sm text-muted-foreground italic" : "text-sm text-foreground"}>
        {empty ? "Not answered" : children}
      </dd>
    </div>
  );
}

function Chips({ values, label }: { values: string[]; label: (value: string) => string }) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Badge key={value} variant="outline">
          {label(value)}
        </Badge>
      ))}
    </div>
  );
}

/**
 * The structured Business Profile.
 *
 * This is the surface that later AI features will read from — deliberately a
 * complete picture including the gaps, since "we never asked about budget" is
 * itself context worth carrying forward.
 */
export default async function BusinessProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getBusinessContext(id);

  if (!context) notFound();

  const { project, business, completion } = context;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Business profile"
        title={project.name}
        description={
          completion.isComplete
            ? "The context LUMEN will use for this business."
            : `Incomplete — ${completion.answered} of ${completion.total} required answers.`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {completion.isComplete ? (
              <Badge variant="success">Complete</Badge>
            ) : (
              <Badge variant="warning">Incomplete</Badge>
            )}
            <Button asChild variant="outline">
              <Link href={`/projects/${project.id}/onboarding`}>
                <Pencil />
                Edit profile
              </Link>
            </Button>
          </div>
        }
      />

      {!completion.isComplete && (
        <Card variant="aurora">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {completion.missing.length} required{" "}
                {completion.missing.length === 1 ? "answer is" : "answers are"} still missing
              </p>
              <p className="text-sm text-muted-foreground">
                Finish onboarding to make this profile usable as context.
              </p>
            </div>
            <Button asChild>
              <Link href={`/projects/${project.id}/onboarding`}>
                Continue onboarding
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <Detail label="Business name">{business.name}</Detail>
            <Detail label="Website">
              {business.website ? (
                <a
                  href={business.website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-md text-[color:var(--gradient-from)] underline-offset-4 hover:underline"
                >
                  {business.website.replace(/^https?:\/\//, "")}
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </Detail>
            <Detail label="Industry">{industryLabel(business.industry)}</Detail>
            <Detail label="Based in">{countryLabel(business.country)}</Detail>
            <Detail label="Description">{business.description}</Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Offering &amp; customers</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <Detail label="Product or service">{business.productOrService}</Detail>
            <Detail label="Business model">
              {business.businessModel ? BUSINESS_MODEL_SHORT[business.businessModel] : null}
            </Detail>
            <Detail label="Target customers">{business.targetCustomers}</Detail>
            <Detail label="Target markets">
              <Chips values={business.targetMarkets} label={marketLabel} />
            </Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marketing</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <Detail label="Business stage">{BUSINESS_STAGE_SHORT[business.businessStage]}</Detail>
            <Detail label="Primary goal">{PRIMARY_GOAL_SHORT[business.primaryGoal]}</Detail>
            <Detail label="Current channels">
              <Chips values={business.currentMarketingChannels} label={channelLabel} />
            </Detail>
            <Detail label="Monthly budget">
              {business.monthlyBudget
                ? `${business.monthlyBudget.amount.toLocaleString("en-US")} ${business.monthlyBudget.currency}`
                : null}
            </Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Context</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <Detail label="Challenges">
              <Chips values={business.currentChallenges} label={challengeLabel} />
            </Detail>
            <Detail label="Competitors">
              <Chips values={business.knownCompetitors} label={(value) => value} />
            </Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border">
            <Detail label="Brand voice">
              <Chips values={business.brandVoice} label={brandVoiceLabel} />
            </Detail>
            <Detail label="Social links">
              {business.socialLinks.length > 0 ? (
                <ul className="space-y-1.5">
                  {business.socialLinks.map((link) => (
                    <li key={link.platform}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 rounded-md underline-offset-4 hover:underline"
                      >
                        <span className="text-muted-foreground">{link.platform}</span>
                        <span className="text-[color:var(--gradient-from)]">
                          {link.url.replace(/^https?:\/\//, "")}
                        </span>
                        <ExternalLink className="size-3.5 text-muted-foreground" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Detail>
            <Detail label="Notes">
              {business.notes ? (
                <p className="leading-relaxed whitespace-pre-wrap">{business.notes}</p>
              ) : null}
            </Detail>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
