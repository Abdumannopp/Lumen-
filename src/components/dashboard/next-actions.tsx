import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import type { NextAction } from "@/lib/dashboard/state";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The dashboard's answer to "what should I work on next?".
 *
 * Every entry is derived from a column that is genuinely empty, and each one
 * says why it matters — a list of chores without reasons gets ignored. The
 * first item carries the accent treatment so there is exactly one obvious
 * starting point.
 */
export function NextActions({ actions }: { actions: NextAction[] }) {
  if (actions.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-6">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-success/30 bg-success/10 text-success">
            <Check className="size-4" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Everything on record is filled in</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The profile is complete and every module has been started. Keep entering results as
              the work runs — nothing is synced automatically, so what you record is what any advice
              can reason from.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <ol className="space-y-2">
      {actions.map((action, index) => (
        <li key={action.id}>
          <Card variant={index === 0 ? "aurora" : "default"}>
            <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 font-mono text-[0.6875rem] tracking-wider text-muted-foreground tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground">{action.label}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{action.reason}</p>
                </div>
              </div>

              <Link
                href={action.href}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md text-xs text-[color:var(--gradient-from)] transition-opacity hover:opacity-80"
              >
                Open
                <ArrowRight className="size-3" />
              </Link>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}
