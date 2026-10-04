import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Section heading.
 *
 * Ten files hand-rolled this same mono/uppercase/tracked label with slightly
 * different sizes and spacing. Consolidating it is what keeps the interface
 * feeling like one product rather than nine modules built in sequence.
 */
export function SectionHeading({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1",
        className,
      )}
    >
      <div className="space-y-1">
        <h2 className="flex items-center gap-1.5 font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
          {icon}
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
