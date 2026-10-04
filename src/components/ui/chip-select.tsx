"use client";

import { Check } from "lucide-react";
import type { Option } from "@/config/project";
import { cn } from "@/lib/utils";

/**
 * Multi-select rendered as toggleable chips.
 *
 * Controlled by the caller and mirrored into hidden inputs, so the surrounding
 * form posts repeated fields and the whole thing works without a form library.
 * Chips beat a listbox here: the option sets are short, and seeing every choice
 * at once is the point.
 */
export function ChipSelect({
  name,
  options,
  value,
  onChange,
  columns = false,
}: {
  name: string;
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  columns?: boolean;
}) {
  function toggle(entry: string) {
    onChange(value.includes(entry) ? value.filter((item) => item !== entry) : [...value, entry]);
  }

  return (
    <div>
      {value.map((entry) => (
        <input key={entry} type="hidden" name={name} value={entry} />
      ))}

      <ul className={cn("flex flex-wrap gap-1.5", columns && "sm:grid sm:grid-cols-2")}>
        {options.map((option) => {
          const active = value.includes(option.value);

          return (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => toggle(option.value)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs transition-colors",
                  active
                    ? "border-primary/45 bg-primary/15 text-foreground"
                    : "border-border bg-secondary/50 text-muted-foreground hover:border-border-strong hover:text-foreground",
                )}
              >
                {active && <Check className="size-3 shrink-0" />}
                {option.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
