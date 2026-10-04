import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  /** Must match the input's id and its `name`, so errors bind correctly. */
  name: string;
  label: string;
  /** Guidance shown before the person makes a mistake, not after. */
  hint?: string;
  optional?: boolean;
  errors?: string[];
  className?: string;
  children: React.ReactNode;
}

/**
 * Form field wrapper.
 *
 * Owns the label, hint and error wiring so every field in the product reports
 * problems the same way, and so `aria-describedby` and `aria-invalid` are never
 * forgotten. Errors are rendered in an assertive live region because they
 * appear after a submit the user has already stopped looking at.
 */
export function Field({ name, label, hint, optional, errors, className, children }: FieldProps) {
  const hasError = Boolean(errors?.length);
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = hasError ? `${name}-error` : undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={name}>{label}</Label>
        {optional && (
          <span className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
            Optional
          </span>
        )}
      </div>

      {/* Children receive the wiring via cloneElement so callers cannot forget it. */}
      {React.isValidElement<Record<string, unknown>>(children)
        ? React.cloneElement(children, {
            id: name,
            name,
            "aria-invalid": hasError || undefined,
            "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
          })
        : children}

      {hint && !hasError && (
        <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}

      {hasError && (
        <p id={errorId} role="alert" className="text-xs leading-relaxed text-destructive">
          {errors?.[0]}
        </p>
      )}
    </div>
  );
}
