"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Trash2, User } from "lucide-react";

import { deleteSegmentAction } from "@/lib/audience/actions";
import type { SegmentRecord } from "@/lib/audience/queries";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/40" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One audience segment.
 *
 * Collapsed by default beyond the summary: a full segment is five lists and a
 * set of personas, and stacking three of those expanded turns the page into a
 * wall. The evidence note stays visible whatever the state, because knowing
 * what a segment rests on is not a detail.
 */
export function SegmentCard({
  projectId,
  segment,
  onEdit,
}: {
  projectId: string;
  segment: SegmentRecord;
  onEdit: (segment: SegmentRecord) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-base font-semibold">{segment.name}</h3>
              <SourceBadge source={segment.source} agent="PULSE" />
              <Badge variant="outline">{segment.kind}</Badge>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{segment.description}</p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onEdit(segment)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${segment.name}`}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await deleteSegmentAction(projectId, segment.id);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </div>
        </div>

        {segment.evidenceNote && (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-mono text-[0.625rem] tracking-[0.14em] uppercase">Basis: </span>
            {segment.evidenceNote}
          </p>
        )}

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 rounded-md font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Hide detail" : "Show detail"}
        </button>

        {expanded && (
          <div className="space-y-6 border-t border-border pt-5">
            <div className="grid gap-6 sm:grid-cols-2">
              <List title="Pain points" items={segment.painPoints} />
              <List title="Motivations" items={segment.motivations} />
              <List title="Buying triggers" items={segment.buyingTriggers} />
              <List title="Objections" items={segment.objections} />
              <List title="Preferred channels" items={segment.preferredChannels} />
              <List title="Messaging angles" items={segment.messagingAngles} />
            </div>

            {segment.icp && segment.icp.attributes.length > 0 && (
              <div className="space-y-2">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  Ideal customer profile
                </p>
                <dl className="divide-y divide-border rounded-lg border border-border">
                  {segment.icp.attributes.map((attribute) => (
                    <div
                      key={`${attribute.label}-${attribute.value}`}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2"
                    >
                      <dt className="text-xs text-muted-foreground">{attribute.label}</dt>
                      <dd className="text-sm text-foreground">{attribute.value}</dd>
                      {/* Inferred attributes are labelled so a reasoned guess is
                          never read as a fact the operator supplied. */}
                      <Badge
                        variant={attribute.basis === "stated" ? "default" : "warning"}
                        className="ml-auto"
                      >
                        {attribute.basis}
                      </Badge>
                    </div>
                  ))}
                </dl>
                <div className="grid gap-6 pt-2 sm:grid-cols-2">
                  <List title="Qualifying signals" items={segment.icp.qualifyingSignals} />
                  <List title="Disqualifiers" items={segment.icp.disqualifiers} />
                </div>
              </div>
            )}

            {segment.personas.length > 0 && (
              <div className="space-y-3">
                <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                  Personas — illustrative, not real people
                </p>
                {segment.personas.map((persona) => (
                  <div key={persona.id} className="rounded-xl border border-border bg-surface/50 p-4">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
                        <User className="size-3.5" />
                      </span>
                      <p className="text-sm font-medium text-foreground">{persona.name}</p>
                      <p className="text-xs text-muted-foreground">{persona.role}</p>
                    </div>
                    <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                      {persona.snapshot}
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <List title="Goals" items={persona.goals} />
                      <List title="Frustrations" items={persona.painPoints} />
                      <List title="Objections" items={persona.objections} />
                      <List title="Where they are" items={persona.channels} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
