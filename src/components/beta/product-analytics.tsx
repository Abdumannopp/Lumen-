import { BarChart3, Clock3, Repeat2, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductAnalyticsView } from "@/lib/beta/product-analytics";

const rate = (value: number | null) => value === null ? "—" : `${value}%`;
const days = (value: number | null) => value === null ? "—" : `${value}d`;

export function ProductAnalytics({ analytics }: { analytics: ProductAnalyticsView }) {
  const latestEligibleW4 = [...analytics.retention].reverse().find((row) => row.w4Rate !== null);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[0.625rem] tracking-[0.18em] text-muted-foreground uppercase">Product health</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Activation & retention</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">Meaningful product actions only — no page-view inflation. Cohorts use workspaces, not projects.</p>
        </div>
        <Badge variant="accent">Last {analytics.windowDays} days</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icon={<UsersRound className="size-4" />} label="Activation" value={rate(analytics.activation.activationRate)} note={`${analytics.activation.onboardingCompleted} of ${analytics.activation.created} workspaces`} />
        <Kpi icon={<Clock3 className="size-4" />} label="Median to first plan" value={days(analytics.activation.medianDaysToPlan)} note="Onboarding → weekly plan" />
        <Kpi icon={<Repeat2 className="size-4" />} label="Latest W4 retention" value={rate(latestEligibleW4?.w4Rate ?? null)} note={latestEligibleW4 ? `Cohort ${latestEligibleW4.cohort}` : "Waiting for an eligible W4 cohort"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Activation funnel</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr className="border-b border-border"><th className="pb-3 font-medium">Step</th><th className="pb-3 text-right font-medium">Workspaces</th><th className="pb-3 text-right font-medium">% of created</th></tr></thead>
              <tbody>{analytics.funnel.map((step) => <tr key={step.key} className="border-b border-border last:border-0"><td className="py-3 pr-3">{step.label}</td><td className="py-3 text-right font-medium">{step.workspaces}</td><td className="py-3 text-right text-muted-foreground">{rate(step.rateFromCreated)}</td></tr>)}</tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex items-center gap-2"><Repeat2 className="size-4" /><CardTitle>Weekly retention cohorts</CardTitle></div></CardHeader>
        <CardContent>
          {analytics.retention.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">Not enough activated workspaces yet to form a cohort.</p> :
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr className="border-b border-border"><th className="pb-3 font-medium">Cohort</th><th className="pb-3 text-right font-medium">Activated</th><th className="pb-3 text-right font-medium">W1</th><th className="pb-3 text-right font-medium">W2</th><th className="pb-3 text-right font-medium">W4</th></tr></thead>
            <tbody>{analytics.retention.map((row) => <tr key={row.cohort} className="border-b border-border last:border-0"><td className="py-3 pr-3 font-mono text-xs">{row.cohort}</td><td className="py-3 text-right font-medium">{row.activated}</td><td className="py-3 text-right">{row.eligibleW1 ? `${rate(row.w1Rate)} (${row.retainedW1}/${row.eligibleW1})` : "—"}</td><td className="py-3 text-right">{row.eligibleW2 ? `${rate(row.w2Rate)} (${row.retainedW2}/${row.eligibleW2})` : "—"}</td><td className="py-3 text-right">{row.eligibleW4 ? `${rate(row.w4Rate)} (${row.retainedW4}/${row.eligibleW4})` : "—"}</td></tr>)}</tbody>
          </table></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div className="flex items-center gap-2"><BarChart3 className="size-4" /><CardTitle>Event volume</CardTitle></div></CardHeader>
        <CardContent><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{analytics.eventVolume.map((event) => <div key={event.name} className="rounded-xl border border-border bg-muted/20 p-3"><p className="text-xs leading-relaxed text-muted-foreground">{event.name}</p><p className="mt-1 text-lg font-semibold">{event.count}</p></div>)}</div></CardContent>
      </Card>
    </section>
  );
}

function Kpi({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-border bg-surface/35 p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p></div>;
}
