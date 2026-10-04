import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, FlaskConical, MessageSquareQuote } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ObservedMovement } from "@/lib/dashboard/proof-of-value";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatMovement(movement: ObservedMovement) {
  const sign = movement.delta > 0 ? "+" : "";
  if (movement.changePct !== null) return `${sign}${movement.changePct}%`;
  return `${sign}${formatNumber(movement.delta)}`;
}

export function ProofOfValue({
  proof,
}: {
  proof: Awaited<ReturnType<typeof import("@/lib/dashboard/proof-of-value").getProofOfValue>>;
}) {
  const noEvidence = proof.completedTasks === 0 && !proof.hasAnalytics && proof.completedExperiments === 0;

  return (
    <Card variant="aurora">
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Proof of value</p>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Lumen separates what was done, what you observed, and what an experiment actually proved.
            </p>
          </div>
          <Badge variant="accent">Evidence loop</Badge>
        </div>

        {noEvidence ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
            Complete a weekly task, record what happened, or add measured performance data to start building your proof trail.
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Completed" value={proof.completedTasks} icon={<CheckCircle2 className="size-4" />} />
              <Metric label="Outcomes captured" value={`${proof.outcomeCaptured} / ${proof.completedTasks}`} icon={<MessageSquareQuote className="size-4" />} />
              <Metric label="Experiment learnings" value={proof.completedExperiments} icon={<FlaskConical className="size-4" />} />
            </div>

            {proof.observedMovements.length > 0 && (
              <div className="space-y-3">
                <div>
                  <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
                    Observed business movement
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Last {proof.recentDays} days vs the previous {proof.recentDays}. Recorded analytics only — not attributed to Lumen.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {proof.observedMovements.map((movement) => (
                    <div key={movement.key} className="rounded-xl border border-border bg-muted/20 p-4">
                      <p className="text-xs text-muted-foreground">{movement.label}</p>
                      <p className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                        {formatMovement(movement)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatNumber(movement.previous)} → {formatNumber(movement.recent)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/plan">
              Review outcomes <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/analytics">Open analytics</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}
