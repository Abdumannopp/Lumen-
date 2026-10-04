import { BrainCircuit, CheckCircle2, Gauge, MessageSquareText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AILearningSignals } from "@/lib/ai/learning-loop";

const rate = (value: number | null) => value === null ? "—" : `${value}%`;

export function AIEvaluation({ signals }: { signals: AILearningSignals }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[0.625rem] tracking-[0.18em] text-muted-foreground uppercase">AI quality loop</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Evaluation & learning</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">Operator behaviour and recorded outcomes are used as feedback signals. These do not prove causal business impact.</p>
        </div>
        <Badge variant="accent">Last {signals.windowDays} days</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi icon={<BrainCircuit className="size-4" />} label="AI reliability" value={rate(signals.reliability.successRate)} note={`${signals.reliability.succeeded}/${signals.reliability.settled || 0} settled runs succeeded`} />
        <Kpi icon={<CheckCircle2 className="size-4" />} label="Recommendation adoption" value={rate(signals.recommendationDecisions.adoptionRate)} note={`${signals.recommendationDecisions.adopted}/${signals.recommendationDecisions.decided || 0} decided AI recommendations`} />
        <Kpi icon={<ListChecks className="size-4" />} label="Task completion" value={rate(signals.execution.completionRate)} note={`${signals.execution.completed} completed, ${signals.execution.skipped} skipped`} />
        <Kpi icon={<Gauge className="size-4" />} label="Outcome capture" value={rate(signals.execution.outcomeCaptureRate)} note={`${signals.execution.outcomeCaptured} completed tasks with a recorded result`} />
      </div>

      <Card>
        <CardHeader><CardTitle>Recent learning signals</CardTitle></CardHeader>
        <CardContent>
          {signals.recentLessons.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">No operator outcomes, feedback or experiment learnings recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {signals.recentLessons.map((lesson, index) => (
                <div key={`${lesson.kind}-${index}`} className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                  <p className="text-[0.625rem] font-mono tracking-[0.12em] text-muted-foreground uppercase">{lesson.kind.replace("_", " ")}</p>
                  <p className="mt-1 text-sm leading-relaxed">{lesson.text}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <MessageSquareText className="size-3.5" />
        {signals.feedback.responses} operator feedback responses are in the current learning window.
      </div>
    </section>
  );
}

function Kpi({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-border bg-surface/35 p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p></div>;
}
