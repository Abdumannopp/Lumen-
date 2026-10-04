import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Horizontal rhythm for the whole product.
 *
 * Page width is decided here and nowhere else, so no view invents its own
 * max-width. Gutters step up at each breakpoint rather than staying fixed,
 * which keeps the measure comfortable on wide displays.
 */
const containerVariants = cva("mx-auto w-full px-5 sm:px-6 lg:px-8", {
  variants: {
    size: {
      /** Long-form reading column. */
      content: "max-w-[46rem]",
      /** Default application and marketing width. */
      default: "max-w-[80rem]",
      /** Dense data views that benefit from the extra room. */
      wide: "max-w-[96rem]",
      /** Fill the available space; used inside the app shell. */
      full: "max-w-none",
    },
  },
  defaultVariants: { size: "default" },
});

function Container({
  className,
  size,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof containerVariants>) {
  return <div className={cn(containerVariants({ size }), className)} {...props} />;
}

export { Container, containerVariants };
