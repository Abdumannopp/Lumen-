"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { appNavigation, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/utils";

const BETA_ADMIN_ITEM: NavItem = { label: "Beta", href: "/admin", icon: ShieldCheck };

export function AppNav({ onNavigate, founder = false }: { onNavigate?: () => void; founder?: boolean }) {
  const pathname = usePathname();
  const sections = founder
    ? appNavigation.map((section) => section.label === "Workspace" ? { ...section, items: [...section.items, BETA_ADMIN_ITEM] } : section)
    : appNavigation;

  return (
    <nav className="flex flex-col gap-7" aria-label="Main">
      {sections.map((section) => (
        <div key={section.label} className="space-y-2">
          <p className="px-3 text-[0.625rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">{section.label}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              if (item.disabled) return (
                <li key={item.href}><span className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground"><Icon className="size-4" />{item.label}<span className="ml-auto text-[0.5625rem] uppercase opacity-70">soon</span></span></li>
              );
              return (
                <li key={item.href}>
                  <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                    className={cn("group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all", active ? "bg-secondary text-foreground shadow-[inset_0_0_0_1px_rgb(91_67_245_/_0.08)]" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")}>
                    {active && <span className="absolute left-1.5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-[linear-gradient(var(--gradient-from),var(--gradient-to))]" />}
                    <Icon className={cn("size-4", active ? "text-primary" : "group-hover:text-primary")} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
