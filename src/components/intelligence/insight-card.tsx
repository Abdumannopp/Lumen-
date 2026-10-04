"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleHelp, Loader2, Quote, Sparkles, X } from "lucide-react";

import { deleteInsightAction } from "@/lib/intelligence/actions";
import type { InsightRecord } from "@/lib/intelligence/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * One market insight.
 *
 * The three-way split the spec requires is laid out explicitly: what was
 * recorded, what SCOUT reasoned, what nobody knows. Showing them together is
 * what stops a reasoned conclusion hardening into a remembered fact.
 */
export function InsightCard({
  projectId,
  insight,
}: {
  projectId: string;
  insight: InsightRecord;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h4 className="font-display text-sm font-semibold">{insight.title}</h4>
            <p className="text-sm leading-relaxed text-muted-foreground">{insight.detail}</p>
          </div>

          {/* Dismissing one insight you disagree with should not require
              re-running the whole analysis. */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Dismiss ${insight.title}`}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteInsightAction(projectId, insight.id);
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <X />}
          </Button>
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.16em] text-success uppercase">
              <Quote className="size-3" />
              You recorded
            </p>
            <ul className="space-y-1">
              {insight.evidence.map((item) => (
                <li key={item} className="text-xs leading-relaxed text-muted-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {insight.assumptions.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.16em] text-warning uppercase">
                <Sparkles className="size-3" />
                SCOUT inferred
              </p>
              <ul className="space-y-1">
                {insight.assumptions.map((item) => (
                  <li key={item} className="text-xs leading-relaxed text-muted-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {insight.unknowns.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                <CircleHelp className="size-3" />
                Still unknown
              </p>
              <ul className="space-y-1">
                {insight.unknowns.map((item) => (
                  <li key={item} className="text-xs leading-relaxed text-muted-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
