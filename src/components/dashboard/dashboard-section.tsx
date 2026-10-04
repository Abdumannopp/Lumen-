import * as React from "react";
import { SectionHeading } from "@/components/layout/section-heading";
import { cn } from "@/lib/utils";

export function DashboardSection({ title, description, action, className, children }: { title: string; description?: string; action?: React.ReactNode; className?: string; children: React.ReactNode; }) {
  return <section className={cn("space-y-4", className)}><SectionHeading title={title} description={description} action={action} />{children}</section>;
}
export function SectionPlaceholder({ title, description, action, note }: { title: string; description: string; action?: React.ReactNode; note?: string; }) {
  return <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border bg-surface/70 px-6 py-8 sm:flex-row sm:items-center sm:justify-between"><div className="space-y-1.5"><p className="text-sm font-semibold text-foreground">{title}</p><p className="max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</p></div>{action ?? (note ? <span className="shrink-0 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">{note}</span> : null)}</div>;
}
