"use client";

import { Toaster as Sonner } from "sonner";

/**
 * Toast host, mounted once in the root layout. Styling comes from design
 * tokens rather than Sonner's theme so toasts match every other surface.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "!bg-popover !text-popover-foreground !border !border-border !rounded-xl !shadow-[0_24px_60px_-32px_rgb(0_0_0/0.85)]",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-secondary !text-secondary-foreground",
        },
      }}
    />
  );
}
