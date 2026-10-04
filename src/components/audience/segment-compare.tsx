"use client";

import { useState } from "react";
import { Columns2 } from "lucide-react";

import type { SegmentRecord } from "@/lib/audience/queries";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/layout/section-heading";
import { cn } from "@/lib/utils";

const ROWS = [
  { key: "painPoints", label: "Pain points" },
  { key: "motivations", label: "Motivations" },
  { key: "buyingTriggers", label: "Buying triggers" },
  { key: "objections", label: "Objections" },
  { key: "preferredChannels", label: "Channels" },
  { key: "messagingAngles", label: "Messaging angles" },
] as const;

/**
 * Side-by-side comparison.
 *
 * Aligned rows rather than two stacked cards, because the useful question is
 * "how do these differ", and that is only answerable when the same attribute
 * sits at the same height in both columns.
 */
export function SegmentCompare({ segments }: { segments: SegmentRecord[] }) {
  const [selected, setSelected] = useState<string[]>([]);

  if (segments.length < 2) return null;

  const chosen = segments.filter((segment) => selected.includes(segment.id));

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        // Two at a time keeps the columns readable on a laptop.
        : [...current, id].slice(-2),
    );
  }

  return (
    <section className="space-y-4">
      <SectionHeading title="Compare segments" icon={<Columns2 className="size-3" />} />

      <div className="flex flex-wrap gap-1.5">
        {segments.map((segment) => (
          <button
            key={segment.id}
            type="button"
            onClick={() => toggle(segment.id)}
            aria-pressed={selected.includes(segment.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              selected.includes(segment.id)
                ? "border-primary/45 bg-primary/15 text-foreground"
                : "border-border bg-secondary/50 text-muted-foreground hover:text-foreground",
            )}
          >
            {segment.name}
          </button>
        ))}
      </div>

      {chosen.length === 2 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[36rem] text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-32 px-4 py-3 font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">
                    Attribute
                  </th>
                  {chosen.map((segment) => (
                    <th key={segment.id} className="px-4 py-3 text-sm font-semibold text-foreground">
                      {segment.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.key} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 align-top font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
                      {row.label}
                    </td>
                    {chosen.map((segment) => (
                      <td key={segment.id} className="px-4 py-3 align-top">
                        {segment[row.key].length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">Not set</span>
                        ) : (
                          <ul className="space-y-1">
                            {segment[row.key].map((item) => (
                              <li key={item} className="text-sm leading-relaxed text-muted-foreground">
                                {item}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
