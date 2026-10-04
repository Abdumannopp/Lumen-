import { cn } from "@/lib/utils";

/**
 * Ambient background: two soft accent blooms behind a hairline grid.
 *
 * Fixed and pointer-events-none so it never participates in layout or
 * interaction, and rendered once per route group rather than per page.
 */
export function AuroraBackdrop({
  className,
  grid = true,
}: {
  className?: string;
  grid?: boolean;
}) {
  return (
    <div aria-hidden className={cn("pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}>
      {grid && <div className="signal-grid absolute inset-0 opacity-[0.5]" />}
      <div
        className="animate-drift absolute -top-40 -left-24 size-[38rem] rounded-full blur-[120px]"
        style={{ background: "radial-gradient(circle, var(--glow-violet) 0%, transparent 68%)" }}
      />
      <div
        className="animate-drift absolute -top-24 right-[-12rem] size-[34rem] rounded-full blur-[130px] [animation-delay:-8s]"
        style={{ background: "radial-gradient(circle, var(--glow-blue) 0%, transparent 70%)" }}
      />
    </div>
  );
}
