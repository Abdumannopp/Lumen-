import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";
import { marketingNavigation } from "@/config/navigation";

export function MarketingHeader() {
  return <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-xl"><Container className="flex h-20 items-center justify-between gap-6"><Link href="/" className="rounded-xl"><Logo /></Link><nav aria-label="Marketing" className="hidden items-center gap-7 md:flex">{marketingNavigation.map((item) => <Link key={item.href} href={item.href} className="rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">{item.label}</Link>)}</nav><div className="flex items-center gap-2"><Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button><Button asChild size="sm"><Link href="/signup">Start free</Link></Button></div></Container></header>;
}
