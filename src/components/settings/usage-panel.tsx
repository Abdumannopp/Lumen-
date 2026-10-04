import { featureLabel } from "@/config/usage";
import { formatUsd } from "@/lib/usage/pricing";
import type { UsageSummary } from "@/lib/usage/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/**
 * What the AI has cost this month.
 *
 * A server component with no interactivity, because none of this is a control —
 * it is four numbers the operator needs in order to decide what to price and
 * what to change.
 *
 * Two decisions in how it reads. The allowance bar shows what is *left* rather
 * than what is spent, because "12 remaining" is the number someone acts on.
 * And the cost is labelled an estimate everywhere it appears: it is computed
 * from published rates that vendors change without telling us, and the invoice
 * is the truth. A dashboard that quietly presents an estimate as a fact is how
 * a product gets priced wrong.
 */

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <dt className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="font-display text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function UsagePanel({ usage }: { usage: UsageSummary }) {
  const { allowance } = usage;
  const usedFraction = allowance.limit > 0 ? Math.min(1, allowance.used / allowance.limit) : 0;
  const renews = allowance.periodEnd.toISOString().slice(0, 10);

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-foreground">
              <span className="font-display text-lg font-semibold tabular-nums">
                {allowance.remaining}
              </span>{" "}
              of {allowance.limit} AI actions left
            </p>
            <p className="text-xs text-muted-foreground">Renews {renews}</p>
          </div>

          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
            role="img"
            aria-label={`${allowance.used} of ${allowance.limit} AI actions used`}
          >
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--gradient-from),var(--gradient-to))]"
              style={{ width: `${usedFraction * 100}%` }}
            />
          </div>

          {allowance.exhausted && (
            <p className="text-sm text-destructive">
              The allowance is spent. Nothing will be sent to the AI provider until it renews.
            </p>
          )}
          {!allowance.exhausted && usage.low && (
            <p className="text-sm text-warning">Running low. It renews on {renews}.</p>
          )}
        </div>

        <dl className="grid gap-5 border-t border-border pt-5 sm:grid-cols-3">
          <Stat
            label="Estimated cost"
            value={formatUsd(usage.costUsd)}
            hint={
              usage.unpricedRuns > 0
                ? `${usage.unpricedRuns} run${usage.unpricedRuns === 1 ? "" : "s"} used a model with no published rate, so this is a floor.`
                : "From published rates. Your provider's invoice is the real number."
            }
          />
          <Stat
            label="Runs"
            value={String(usage.runs)}
            hint={`${usage.failed} failed`}
          />
          <Stat
            label="Error rate"
            value={`${Math.round(usage.errorRate * 100)}%`}
            hint={usage.runs === 0 ? "Nothing has run yet." : undefined}
          />
        </dl>

        {usage.byFeature.length > 0 && (
          <div className="space-y-3 border-t border-border pt-5">
            <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
              Where it went
            </p>
            <ul className="space-y-2">
              {usage.byFeature.map((feature) => (
                <li
                  key={feature.featureKey}
                  className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {featureLabel(feature.featureKey)}
                    {usage.mostExpensive?.featureKey === feature.featureKey &&
                      usage.byFeature.length > 1 && <Badge variant="outline">Most</Badge>}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {feature.runs} run{feature.runs === 1 ? "" : "s"} ·{" "}
                    {formatUsd(feature.costUsd)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
