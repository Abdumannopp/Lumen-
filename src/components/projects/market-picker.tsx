"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";

import { MARKETS, marketLabel } from "@/config/project";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const WORLDWIDE = "R-WW";

/**
 * Multi-select for target markets.
 *
 * Selections are mirrored into hidden inputs so the surrounding form posts them
 * as repeated `targetMarkets` fields — the picker stays a controlled component
 * without the page needing any client-side form library.
 *
 * "Worldwide" is mutually exclusive with everything else: holding both would be
 * contradictory data, so choosing one clears the other rather than warning
 * about it afterwards.
 */
export function MarketPicker({
  name = "targetMarkets",
  defaultValue = [],
  onChange,
}: {
  name?: string;
  defaultValue?: string[];
  /** Notified on every toggle. Chip clicks are not input events, so a parent
      relying on form `onChange` would otherwise never hear about them. */
  onChange?: (next: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? MARKETS.filter((market) => market.label.toLowerCase().includes(needle))
      : MARKETS;

    return {
      Reach: matches.filter((market) => market.group === "Reach"),
      Regions: matches.filter((market) => market.group === "Regions"),
      Countries: matches.filter((market) => market.group === "Countries"),
    };
  }, [query]);

  function toggle(value: string) {
    setSelected((current) => {
      let next: string[];

      if (value === WORLDWIDE) {
        next = current.includes(WORLDWIDE) ? [] : [WORLDWIDE];
      } else {
        const withoutWorldwide = current.filter((entry) => entry !== WORLDWIDE);
        next = withoutWorldwide.includes(value)
          ? withoutWorldwide.filter((entry) => entry !== value)
          : [...withoutWorldwide, value];
      }

      onChange?.(next);
      return next;
    });
  }

  const totalMatches = groups.Reach.length + groups.Regions.length + groups.Countries.length;

  return (
    <div className="space-y-3">
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((value) => (
            <li key={value}>
              <button
                type="button"
                onClick={() => toggle(value)}
                className="flex items-center gap-1.5 rounded-full border border-primary/35 bg-primary/12 px-2.5 py-1 text-xs text-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/12"
              >
                {marketLabel(value)}
                <X className="size-3 opacity-70" />
                <span className="sr-only">Remove {marketLabel(value)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search regions and countries"
          aria-label="Search markets"
          className="pl-9"
        />
      </div>

      <div className="max-h-60 space-y-4 overflow-y-auto rounded-xl border border-border bg-surface/60 p-3">
        {totalMatches === 0 && (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            No market matches “{query}”.
          </p>
        )}

        {(["Reach", "Regions", "Countries"] as const).map((group) =>
          groups[group].length > 0 ? (
            <div key={group} className="space-y-2">
              <p className="px-1 font-mono text-[0.625rem] tracking-[0.18em] text-muted-foreground uppercase">
                {group}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {groups[group].map((market) => {
                  const active = selected.includes(market.value);

                  return (
                    <li key={market.value}>
                      <button
                        type="button"
                        onClick={() => toggle(market.value)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                          active
                            ? "border-primary/45 bg-primary/15 text-foreground"
                            : "border-border bg-secondary/50 text-muted-foreground hover:border-border-strong hover:text-foreground",
                        )}
                      >
                        {active && <Check className="size-3" />}
                        {market.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
