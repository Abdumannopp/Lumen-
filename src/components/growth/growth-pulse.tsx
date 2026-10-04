import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";

import type { GrowthSignal } from "@/lib/analytics/signals";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const severityVariant: Record<GrowthSignal["severity"], "danger" | "warning" | "default" | "success"> = {
  CRITICAL: "danger",
  HIGH: "warning",
  MEDIUM: "default",
  INFO: "success",
};

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${Math.round(value * 10) / 10}%`;
}

export function GrowthPulse({
  signals,
  hasComparisonData,
}: {
  signals: GrowthSignal[];
  hasComparisonData: boolean;
}) {
  return (
    <Card variant="aurora">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
              Growth pulse
            </p>
            <CardTitle className="mt-1">What changed recently</CardTitle>
          </div>
          <Sparkles className="size-4 text-[color:var(--gradient-from)]" />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Signals come only from this business&apos;s recorded performance — no external benchmarks or guesses.
        </p>
      </CardHeader>

      <CardContent>
        {!hasComparisonData ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-sm leading-relaxed text-muted-foreground">
            Keep recording performance for two comparable periods. Lumen will start surfacing meaningful changes automatically.
          </div>
        ) : signals.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/35 px-4 py-4 text-sm text-muted-foreground">
            <Minus className="size-4" />
            No material change was detected in the recorded data yet.
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => {
              const Icon = signal.direction === "UP" ? ArrowUpRight : ArrowDownRight;
              return (
                <div key={signal.key} className="rounded-xl border border-border bg-surface/35 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <Icon className={`mt-0.5 size-4 ${signal.direction === "UP" ? "text-success" : "text-destructive"}`} />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{signal.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{signal.summary}</p>
                      </div>
                    </div>
                    <Badge variant={severityVariant[signal.severity]}>{signed(signal.changePercent)}</Badge>
                  </div>
                  <div className="mt-3 rounded-lg border border-primary/20 bg-primary/7 px-3 py-2.5 text-sm">
                    <span className="font-mono text-[0.625rem] tracking-[0.14em] text-[color:var(--gradient-from)] uppercase">
                      Next move
                    </span>
                    <p className="mt-1 leading-relaxed text-foreground">{signal.action}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
