import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton placeholder.
 *
 * Sized by the caller so a skeleton occupies the same box as the content it
 * replaces; that is what prevents layout shift when data arrives.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-shimmer rounded-md bg-secondary/70", className)}
      {...props}
    />
  );
}

export { Skeleton };
