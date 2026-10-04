"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ExternalLink, Loader2, Trash2 } from "lucide-react";

import {
  CAMPAIGN_STATUSES,
  channelLabel,
  type CampaignStatusKey,
} from "@/lib/campaigns/agent";
import { deleteCampaignAction, setCampaignStatusAction } from "@/lib/campaigns/actions";
import type { CampaignRecord } from "@/lib/campaigns/queries";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatDayShort } from "@/lib/date";

function money(amount: number | null, currency: string | null) {
  if (amount === null) return null;
  return `${amount.toLocaleString("en-US")}${currency ? ` ${currency}` : ""}`;
}

/**
 * One campaign plan.
 *
 * The budget split is shown as bars with their rationale, because a percentage
 * without a reason is a guess with a number attached — and the reason is the
 * part the operator should be arguing with.
 */
export function CampaignCard({
  projectId,
  campaign,
  onEdit,
}: {
  projectId: string;
  campaign: CampaignRecord;
  onEdit: (campaign: CampaignRecord) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const dates =
    campaign.startDate || campaign.endDate
      ? [campaign.startDate, campaign.endDate]
          .map((date) =>
            date ? formatDayShort(date) : "—",
          )
          .join(" → ")
      : null;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold">{campaign.name}</h3>
              <SourceBadge source={campaign.source} agent="ORBIT" />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{campaign.objective}</p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {dates && <span>{dates}</span>}
              {campaign.totalBudgetAmount !== null && (
                <span>{money(campaign.totalBudgetAmount, campaign.totalBudgetCurrency)}</span>
              )}
              {campaign.channels.length > 0 && <span>{campaign.channels.length} channels</span>}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Select
              value={campaign.status}
              aria-label="Status"
              className="h-8 w-32 text-xs"
              disabled={pending}
              onChange={(event) =>
                startTransition(async () => {
                  await setCampaignStatusAction(
                    projectId,
                    campaign.id,
                    event.target.value as CampaignStatusKey,
                  );
                  router.refresh();
                })
              }
            >
              {CAMPAIGN_STATUSES.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
            </Select>

            <Button variant="ghost" size="sm" onClick={() => onEdit(campaign)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${campaign.name}`}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await deleteCampaignAction(projectId, campaign.id);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </div>
        </div>

        {campaign.channels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {campaign.channels.map((channel) => (
              <Badge key={channel} variant="outline">
                {channelLabel(channel)}
              </Badge>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 rounded-md font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Hide plan" : "Show plan"}
        </button>

        {expanded && (
          <div className="space-y-6 border-t border-border pt-5">
            {campaign.audience && (
              <div className="space-y-1">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  Audience
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">{campaign.audience}</p>
              </div>
            )}

            {campaign.offer && (
              <div className="space-y-1">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  Offer
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">{campaign.offer}</p>
              </div>
            )}

            {campaign.budgetAllocation.length > 0 && (
              <div className="space-y-2">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  Budget allocation
                </p>
                <ul className="space-y-2.5">
                  {campaign.budgetAllocation.map((entry) => (
                    <li key={entry.channel} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-foreground">{channelLabel(entry.channel)}</span>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {entry.percent}%
                          {entry.amount !== null &&
                            ` · ${money(entry.amount, campaign.totalBudgetCurrency)}`}
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,var(--gradient-via),var(--gradient-to))]"
                          style={{ width: `${entry.percent}%` }}
                        />
                      </div>
                      {entry.rationale && (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {entry.rationale}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {campaign.messaging.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  Messaging angles
                </p>
                <ul className="space-y-1">
                  {campaign.messaging.map((angle) => (
                    <li key={angle} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/40" />
                      {angle}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {campaign.creativeConcept && (
              <div className="space-y-1">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  Creative concept
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {campaign.creativeConcept}
                </p>
              </div>
            )}

            {campaign.funnel.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  Funnel
                </p>
                <ol className="space-y-1">
                  {campaign.funnel.map((stage, index) => (
                    <li key={stage} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                      <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                        {index + 1}
                      </span>
                      {stage}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {campaign.kpiFramework.length > 0 && (
              <div className="space-y-2">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  What to measure
                </p>
                <dl className="divide-y divide-border rounded-lg border border-border">
                  {campaign.kpiFramework.map((kpi) => (
                    <div key={kpi.metric} className="space-y-0.5 px-3 py-2">
                      <dt className="text-sm text-foreground">{kpi.metric}</dt>
                      <dd className="text-xs leading-relaxed text-muted-foreground">{kpi.why}</dd>
                    </div>
                  ))}
                </dl>
                {/* Targets are the operator's to set — ORBIT never predicts a number. */}
                <p className="text-xs text-muted-foreground">
                  Targets are yours to set from your own history. ORBIT does not predict results.
                </p>
              </div>
            )}

            {campaign.landingPage && (
              <a
                href={campaign.landingPage}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 rounded-md text-sm text-[color:var(--gradient-from)] underline-offset-4 hover:underline"
              >
                {campaign.landingPage.replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
