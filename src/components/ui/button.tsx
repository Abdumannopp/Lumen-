import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[background,border-color,color,box-shadow,transform] duration-200 outline-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-px",
  {
    variants: {
      variant: {
        primary: "bg-[linear-gradient(100deg,var(--gradient-via),var(--gradient-to))] text-white shadow-[0_12px_30px_-14px_var(--glow-violet)] hover:brightness-105 hover:shadow-[0_16px_40px_-14px_var(--glow-violet)]",
        secondary: "border border-border bg-secondary text-secondary-foreground hover:bg-accent",
        outline: "border border-border-strong bg-card text-foreground hover:border-primary/45 hover:bg-secondary/60",
        ghost: "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: { sm: "h-9 px-3.5 text-[0.8125rem]", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-[0.9375rem]", icon: "size-10" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> { asChild?: boolean; }
function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
export { Button, buttonVariants };
