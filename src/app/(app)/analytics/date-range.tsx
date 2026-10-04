"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toDayInput } from "@/lib/date";

const PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

/**
 * Date range control.
 *
 * Pushes the range into the URL rather than component state, so a range is
 * shareable, survives a refresh, and is read on the server where the data is
 * actually aggregated.
 */
export function DateRangeControl({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(nextFrom: string, nextTo: string) {
    const next = new URLSearchParams(params.toString());
    next.set("from", nextFrom);
    next.set("to", nextTo);
    router.push(`/analytics?${next.toString()}`);
  }

  function preset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    apply(toDayInput(start), toDayInput(end));
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex items-end gap-2">
        <label className="space-y-1">
          <span className="block font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
            From
          </span>
          <Input
            type="date"
            value={from}
            className="h-9 w-40 text-xs"
            onChange={(event) => apply(event.target.value, to)}
          />
        </label>
        <label className="space-y-1">
          <span className="block font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
            To
          </span>
          <Input
            type="date"
            value={to}
            className="h-9 w-40 text-xs"
            onChange={(event) => apply(from, event.target.value)}
          />
        </label>
      </div>

      <div className="flex items-center gap-1">
        <CalendarRange className="size-3.5 text-muted-foreground" />
        {PRESETS.map((entry) => (
          <Button key={entry.days} variant="ghost" size="sm" onClick={() => preset(entry.days)}>
            {entry.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
