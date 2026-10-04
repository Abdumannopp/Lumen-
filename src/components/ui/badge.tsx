import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Small status marker. Set in mono, because a badge always reports state. */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.6875rem] tracking-wide uppercase [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-border bg-secondary text-secondary-foreground",
        accent: "border-primary/35 bg-primary/12 text-[color:var(--gradient-from)]",
        success: "border-success/30 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        danger: "border-destructive/35 bg-destructive/12 text-destructive",
        outline: "border-border-strong bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
