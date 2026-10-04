import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { BUSINESS_MODEL_SHORT, channelLabel } from "@/config/business-profile";
import {
  BUSINESS_STAGE_SHORT,
  PRIMARY_GOAL_SHORT,
  countryLabel,
  industryLabel,
  marketLabel,
} from "@/config/project";
import type { BusinessContext } from "@/lib/business-profile/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

function Cell({ label, children }: { label: string; children?: React.ReactNode }) {
  const empty = children === null || children === undefined || children === "";

  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </p>
      <div className={empty ? "text-sm text-muted-foreground italic" : "text-sm text-foreground"}>
        {empty ? "Not set" : children}
      </div>
    </div>
  );
}

/**
 * What is happening with this business, stated from stored facts only.
 *
 * Gaps render as "Not set" rather than being hidden, so the snapshot doubles as
 * a completeness check without inventing a score.
 */
export function BusinessSnapshot({ context }: { context: BusinessContext }) {
  const { project, business } = context;

  return (
    <Card>
      <CardContent className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-3">
        <Cell label="Industry">{industryLabel(business.industry)}</Cell>
        <Cell label="Based in">{countryLabel(business.country)}</Cell>
        <Cell label="Business model">
          {business.businessModel ? BUSINESS_MODEL_SHORT[business.businessModel] : null}
        </Cell>

        <Cell label="Stage">
          <Badge>{BUSINESS_STAGE_SHORT[business.businessStage]}</Badge>
        </Cell>
        <Cell label="Primary goal">
          <Badge variant="accent">{PRIMARY_GOAL_SHORT[business.primaryGoal]}</Badge>
        </Cell>
        <Cell label="Monthly budget">
          {business.monthlyBudget
            ? `${business.monthlyBudget.amount.toLocaleString("en-US")} ${business.monthlyBudget.currency}`
            : null}
        </Cell>

        <Cell label="Target markets">
          {business.targetMarkets.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {business.targetMarkets.slice(0, 4).map((market) => (
                <Badge key={market} variant="outline">
                  {marketLabel(market)}
                </Badge>
              ))}
              {business.targetMarkets.length > 4 && (
                <Badge variant="outline">+{business.targetMarkets.length - 4}</Badge>
              )}
            </div>
          ) : null}
        </Cell>

        <Cell label="Current channels">
          {business.currentMarketingChannels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {business.currentMarketingChannels.slice(0, 4).map((channel) => (
                <Badge key={channel} variant="outline">
                  {channelLabel(channel)}
                </Badge>
              ))}
              {business.currentMarketingChannels.length > 4 && (
                <Badge variant="outline">+{business.currentMarketingChannels.length - 4}</Badge>
              )}
            </div>
          ) : null}
        </Cell>

        <Cell label="Website">
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
        </Cell>
      </CardContent>

      <div className="border-t border-border px-6 py-3">
        <Link
          href={`/projects/${project.id}/profile`}
          className="rounded-md font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          Full business profile →
        </Link>
      </div>
    </Card>
  );
}
