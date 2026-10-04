import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps extends React.ComponentProps<"header"> { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode; }
function PageHeader({ eyebrow, title, description, actions, className, ...props }: PageHeaderProps) {
  return <header className={cn("flex flex-col gap-6 md:flex-row md:items-end md:justify-between", className)} {...props}>
    <div className="space-y-2.5">
      {eyebrow && <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-primary uppercase">{eyebrow}</p>}
      <h1 className="text-3xl leading-tight font-semibold sm:text-[2rem]">{title}</h1>
      {description && <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}
export { PageHeader };
