import Link from "next/link";
import { ArrowRight, CheckCircle2, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ExecutionMomentum({
  momentum,
}: {
  momentum: {
    hasPlan: boolean;
    total: number;
    done: number;
    skipped: number;
    completionRate: number;
  };
}) {
  if (!momentum.hasPlan) {
    return (
      <Card variant="aurora">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Badge variant="accent">First win</Badge>
            <h2 className="text-lg font-semibold text-foreground">Turn insight into this week’s work</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Generate a focused weekly plan. Lumen will keep the decisions and show what actually got done.
            </p>
          </div>
          <Button asChild>
            <Link href="/plan">
              Create weekly plan <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-primary" />
              <p className="text-sm font-medium text-foreground">Execution momentum</p>
            </div>
            <p className="text-sm text-muted-foreground">
              A factual measure of work completed from the current Lumen plan — not a claim of revenue impact.
            </p>
          </div>
          <Badge variant={momentum.completionRate >= 60 ? "accent" : "outline"}>
            {momentum.completionRate}% complete
          </Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Done" value={momentum.done} icon={<CheckCircle2 className="size-4" />} />
          <Metric label="Remaining" value={Math.max(momentum.total - momentum.done - momentum.skipped, 0)} />
          <Metric label="Skipped" value={momentum.skipped} />
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href="/plan">Open weekly plan <ArrowRight /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
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
