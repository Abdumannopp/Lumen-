import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { BusinessContext } from "@/lib/business-profile/queries";
import type { PlanRecord } from "@/lib/weekly-plan/queries";

export function ActivationCard({
  context,
  plan,
}: {
  context: BusinessContext;
  plan: PlanRecord | null;
}) {
  const profileDone = context.completion.isComplete;
  const planDone = plan !== null;
  const actionDone = plan?.tasks.some((task) => task.status === "DONE") ?? false;

  const completed = [profileDone, planDone, actionDone].filter(Boolean).length;
  const total = 3;

  const next = !profileDone
    ? {
        label: "Finish setup",
        href: `/projects/${context.project.id}/onboarding`,
        description: "Give Lumen the context it needs to make the plan specific.",
      }
    : !planDone
      ? {
          label: "Build this week’s plan",
          href: "/plan",
          description: "Turn the business context into a short list of priorities.",
        }
      : !actionDone
        ? {
            label: "Start the first action",
            href: "/plan",
            description: "Pick the highest-impact task and mark it done when it ships.",
          }
        : null;

  return (
    <Card variant="aurora">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
              First win
            </p>
            <CardTitle className="mt-1">Turn Lumen on for this business</CardTitle>
          </div>
          <span className="font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground tabular-nums uppercase">
            {completed}/{total} complete
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["Business context", profileDone],
            ["Weekly plan", planDone],
            ["First action", actionDone],
          ].map(([label, done]) => (
            <div
              key={String(label)}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface/40 px-3 py-2.5 text-sm"
            >
              {done ? (
                <CheckCircle2 className="size-4 text-[color:var(--gradient-from)]" />
              ) : (
                <Circle className="size-4 text-muted-foreground" />
              )}
              <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
            </div>
          ))}
        </div>

        {next ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{next.description}</p>
            <Button asChild>
              <Link href={next.href}>
                {next.label}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your first growth loop is running. Come back next week, record what happened, and let
            Lumen use that outcome to shape the next plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
