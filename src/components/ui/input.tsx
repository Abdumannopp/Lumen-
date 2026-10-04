import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground transition-colors",
        "placeholder:text-muted-foreground",
        "hover:border-border-strong focus-visible:border-primary/70",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
