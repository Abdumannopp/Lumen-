import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.ComponentProps<"div"> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** The action that resolves the emptiness — an empty screen invites work. */
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-8 py-14 text-center",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="space-y-1.5">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {description && (
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
