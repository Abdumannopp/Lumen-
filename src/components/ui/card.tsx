import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva("rounded-2xl text-card-foreground transition-[box-shadow,border-color,transform] duration-200", {
  variants: {
    variant: {
      default: "bg-card border border-border shadow-[0_8px_28px_-24px_rgba(29,39,78,0.3)]",
      aurora: "aurora-edge bg-card shadow-[0_14px_42px_-24px_var(--glow-violet)]",
      glow: "bg-card border border-border surface-glow",
      ghost: "bg-transparent border border-dashed border-border",
    },
  },
  defaultVariants: { variant: "default" },
});

function Card({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ variant }), className)} {...props} />;
}
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}
function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 data-slot="card-title" className={cn("font-display text-base leading-tight font-semibold", className)} {...props} />;
}
function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />;
}
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("p-6 pt-0", className)} {...props} />;
}
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center gap-3 border-t border-border p-6", className)} {...props} />;
}
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants };
