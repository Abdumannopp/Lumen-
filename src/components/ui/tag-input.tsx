"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Free-text list input, for values with no fixed option set (competitors).
 *
 * Enter commits an entry rather than submitting the form — inside a multi-step
 * flow an accidental submit would jump the person forward, so the keypress is
 * intercepted.
 */
export function TagInput({
  name,
  value,
  onChange,
  placeholder,
  max = 20,
}: {
  name: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const entry = draft.trim();
    if (!entry) return;
    if (value.length >= max) return;
    if (value.some((item) => item.toLowerCase() === entry.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, entry]);
    setDraft("");
  }

  return (
    <div className="space-y-3">
      {value.map((entry) => (
        <input key={entry} type="hidden" name={name} value={entry} />
      ))}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          aria-label="Add an entry"
        />
        <Button type="button" variant="outline" onClick={commit} disabled={!draft.trim()}>
          <Plus />
          Add
        </Button>
      </div>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((entry) => (
            <li key={entry}>
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== entry))}
                className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-xs text-foreground transition-colors hover:border-destructive/50 hover:bg-destructive/12"
              >
                {entry}
                <X className="size-3 opacity-70" />
                <span className="sr-only">Remove {entry}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
