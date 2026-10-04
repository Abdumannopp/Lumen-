import { ArrowUpRight, Megaphone } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductAnalyticsView } from "@/lib/beta/product-analytics";

const rate = (value: number | null) => value === null ? "—" : `${value}%`;

export function AcquisitionAnalytics({ acquisition }: { acquisition: ProductAnalyticsView["acquisition"] }) {
  return (
    <section className="space-y-4">
      <div>
        <p className="font-mono text-[0.625rem] tracking-[0.18em] text-muted-foreground uppercase">Acquisition</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">Which channels create real users?</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          First-party UTM and referrer attribution only. Signups are tied to activation and paid conversion; no ad-platform click data is stored here.
        </p>
      </div>
      <Card>
        <CardHeader><div className="flex items-center gap-2"><Megaphone className="size-4" /><CardTitle>Signup → activation → paid</CardTitle></div></CardHeader>
        <CardContent>
          {acquisition.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">No attributed signups yet. Add UTM parameters to launch links and the next completed signup will appear here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr className="border-b border-border"><th className="pb-3 font-medium">Source</th><th className="pb-3 font-medium">Medium</th><th className="pb-3 font-medium">Campaign</th><th className="pb-3 text-right font-medium">Signups</th><th className="pb-3 text-right font-medium">Activated</th><th className="pb-3 text-right font-medium">Activation</th><th className="pb-3 text-right font-medium">Paid</th><th className="pb-3 text-right font-medium">Paid rate</th></tr></thead>
                <tbody>
                  {acquisition.map((row) => (
                    <tr key={row.key} className="border-b border-border last:border-0">
                      <td className="py-3 pr-3 font-medium">{row.source}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{row.medium}</td>
                      <td className="py-3 text-right">{row.signups}</td>
                      <td className="py-3 text-right">{row.activated}</td>
                      <td className="py-3 text-right text-muted-foreground">{rate(row.activationRate)}</td>
                      <td className="py-3 text-right">{row.paid}</td>
                      <td className="py-3 text-right text-muted-foreground">{rate(row.paidRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowUpRight className="size-3.5" />Optimize for activated and paid workspaces, not raw traffic.</div>
    </section>
  );
}
