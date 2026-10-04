import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/layout/container";
import { siteConfig } from "@/config/site";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/70 py-12">
      <Container className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{siteConfig.tagline}</p>
        </div>
        <div className="flex flex-col gap-3 text-sm sm:items-end">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Link href="/signup" className="rounded-md text-muted-foreground hover:text-foreground">Start free</Link>
            <Link href="/privacy" className="rounded-md text-muted-foreground hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="rounded-md text-muted-foreground hover:text-foreground">Terms</Link>
            <Link href="/security" className="rounded-md text-muted-foreground hover:text-foreground">Security</Link>
          </div>
          <p className="font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground uppercase">
            © {new Date().getFullYear()} {siteConfig.name}
          </p>
        </div>
      </Container>
    </footer>
  );
}
