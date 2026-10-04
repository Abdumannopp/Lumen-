import Link from "next/link";
import { ArrowRight, Check, Lock, Minus } from "lucide-react";

import { MODULES } from "@/config/modules";
import type { ModuleState, ModuleStatus } from "@/lib/dashboard/state";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Status marker per module.
 *
 * `unbuilt` gets the most muted treatment of the four, because "not built yet"
 * is not a problem the person can act on and should not compete for attention
 * with the things they can.
 */
const STATUS_META: Record<ModuleStatus, { label: string; icon: typeof Check; tone: string }> = {
  ready: { label: "Ready", icon: Check, tone: "text-success" },
  empty: { label: "Empty", icon: Minus, tone: "text-muted-foreground" },
  locked: { label: "Blocked", icon: Lock, tone: "text-warning" },
  unbuilt: { label: "Later", icon: Minus, tone: "text-muted-foreground" },
};

export function StatusCard({ state }: { state: ModuleState }) {
  const definition = MODULES.find((module) => module.id === state.id);
  if (!definition) return null;

  const Icon = definition.icon;
  const status = STATUS_META[state.status];
  const StatusIcon = status.icon;
  const actionable = Boolean(state.href && state.cta);

  return (
    <Card
      variant={state.status === "ready" ? "default" : "default"}
      className={cn(
        "transition-colors",
        state.status === "unbuilt" ? "opacity-60" : "hover:border-border-strong",
      )}
    >
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground">
            <Icon className="size-4" />
          </span>
          <span
            className={cn(
              "flex items-center gap-1 font-mono text-[0.625rem] tracking-[0.14em] uppercase",
              status.tone,
            )}
          >
            <StatusIcon className="size-3" />
            {status.label}
          </span>
        </div>

        <div className="flex-1 space-y-1.5">
          <h3 className="font-display text-sm font-semibold">{definition.label}</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">{state.detail}</p>
        </div>

        {actionable ? (
          <Link
            href={state.href!}
            className="inline-flex items-center gap-1.5 rounded-md text-xs text-[color:var(--gradient-from)] transition-opacity hover:opacity-80"
          >
            {state.cta}
            <ArrowRight className="size-3" />
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">{definition.blurb}</span>
        )}
      </CardContent>
    </Card>
  );
}
