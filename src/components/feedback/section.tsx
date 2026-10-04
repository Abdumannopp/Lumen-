import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Vertical rhythm primitive. Section spacing lives here so no page hardcodes
 * its own margins and the scale stays consistent across route groups.
 */
export function Section({
  className,
  spacing = "default",
  ...props
}: React.ComponentProps<"section"> & { spacing?: "tight" | "default" | "loose" }) {
  return (
    <section
      className={cn(
        spacing === "tight" && "py-10 sm:py-14",
        spacing === "default" && "py-16 sm:py-24",
        spacing === "loose" && "py-24 sm:py-36",
        className,
      )}
      {...props}
    />
  );
}
