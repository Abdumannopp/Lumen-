"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { AppNav } from "@/components/layout/app-nav";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function AppShell({ children, topbarSlot, accountSlot, betaSlot, founder }: { children: React.ReactNode; topbarSlot?: React.ReactNode; accountSlot?: React.ReactNode; betaSlot?: React.ReactNode; founder?: boolean; }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", onKeyDown); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = ""; };
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[16.5rem] flex-col border-r border-border bg-surface/92 backdrop-blur-xl lg:flex">
        <div className="flex h-20 items-center px-6"><Link href="/overview" className="rounded-xl"><Logo /></Link></div>
        <Separator />
        <div className="flex-1 overflow-y-auto px-3 py-6"><AppNav founder={founder} /></div>
        {betaSlot && <div className="px-6 pt-2 pb-1">{betaSlot}</div>}
        <div className="px-4 py-4"><div className="rounded-2xl bg-secondary/70 p-3">{accountSlot ?? <p className="text-xs text-muted-foreground">Your workspace is ready to grow.</p>}</div></div>
      </aside>

      {drawerOpen && <div className="fixed inset-0 z-50 lg:hidden">
        <button type="button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-foreground/15 backdrop-blur-sm" />
        <div id="lumen-mobile-nav" role="dialog" aria-modal="true" aria-label="Navigation" className="animate-rise absolute inset-y-0 left-0 flex w-[18rem] flex-col border-r border-border bg-surface shadow-2xl">
          <div className="flex h-20 items-center justify-between px-5"><Logo /><Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)} aria-label="Close navigation"><X /></Button></div>
          <Separator /><div className="flex-1 overflow-y-auto px-3 py-6"><AppNav founder={founder} onNavigate={() => setDrawerOpen(false)} /></div>
          {betaSlot && <div className="px-5 pt-2">{betaSlot}</div>}
          {accountSlot && <div className="px-5 py-4">{accountSlot}</div>}
        </div>
      </div>}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[16.5rem]">
        <header className="sticky top-0 z-20 flex h-20 items-center gap-3 border-b border-border/80 bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open navigation" aria-expanded={drawerOpen} aria-controls="lumen-mobile-nav"><Menu /></Button>
          <Link href="/overview" className="lg:hidden"><Logo markOnly /></Link>
          <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
            <div className="flex h-10 max-w-sm flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-muted-foreground"><Search className="size-4" />Search your workspace</div>
          </div>
          <div className="ml-auto flex items-center gap-2">{topbarSlot}</div>
        </header>
        <main id="main" className="flex-1 px-4 py-7 sm:px-6 lg:px-8 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
