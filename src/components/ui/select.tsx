import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Native select, styled to the design system.
 *
 * Deliberately not a Radix listbox: on mobile the platform picker is faster,
 * more accessible and more familiar than anything reimplemented in a popover.
 * The chevron is decorative; the native control keeps all of its behaviour.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "h-10 w-full appearance-none rounded-lg border border-input bg-surface px-3 pr-9 text-sm text-foreground transition-colors",
          "hover:border-border-strong focus-visible:border-primary/70",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-destructive",
          // Native option lists inherit the OS palette, not ours.
          "[&>option]:bg-[color:var(--popover)] [&>option]:text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

export { Select };
