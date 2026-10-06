import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, LineChart, Sparkles, Target, Zap } from "lucide-react";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/feedback/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PLAN } from "@/config/billing";
import { MarketingStructuredData } from "@/components/marketing/seo-json-ld";
import { siteConfig } from "@/config/site";

const steps = [
  { icon: Target, title: "Share your numbers", description: "Tell Lumen about your business and enter the figures you already track: spend, clicks, leads and customers." },
  { icon: Sparkles, title: "Get AI recommendations", description: "Lumen finds the highest-value opportunity and turns it into a focused weekly plan." },
  { icon: Zap, title: "Take action", description: "Work through simple tasks, capture what happened, and keep the loop moving." },
  { icon: LineChart, title: "See real results", description: "Track the outcomes that matter and use them to shape the next week." },
];

export const metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
  alternates: { canonical: "/" },
  openGraph: { title: `${siteConfig.name} — ${siteConfig.tagline}`, description: siteConfig.description, url: "/", type: "website" },
};

export default function LandingPage() {
  return <>
    <MarketingStructuredData pageTitle={`${siteConfig.name} — ${siteConfig.tagline}`} pageDescription={siteConfig.description} includeSoftware pagePath="/" />

    <Section spacing="loose" className="overflow-hidden pt-16 sm:pt-20 lg:pt-24">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div className="max-w-xl">
            <Badge variant="accent" className="rounded-full px-3 py-1">AI FOR REAL BUSINESS GROWTH</Badge>
            <h1 className="mt-6 text-5xl leading-[0.98] font-semibold sm:text-6xl lg:text-[4.65rem]">Turn your marketing data into <span className="text-gradient">real growth.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">Lumen connects your data, finds the biggest opportunities, creates a weekly plan, and helps you get real results.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button asChild size="lg"><Link href="/signup">Get started free <ArrowRight /></Link></Button><Button asChild size="lg" variant="outline"><Link href="#how-it-works">See how it works</Link></Button></div>
            <div className="mt-5 flex flex-wrap gap-4 text-xs font-medium text-muted-foreground"><span>✓ No credit card required</span><span>✓ Setup in 5 minutes</span><span>✓ Cancel anytime</span></div>
          </div>
          <div className="relative">
            <Card variant="aurora" className="overflow-hidden rounded-[2rem] bg-surface/90 p-2 shadow-[0_30px_80px_-36px_var(--glow-violet)]">
              <div className="overflow-hidden rounded-[1.5rem] border border-border bg-background">
                <Image src="/brand/lumen-ui-showcase.png" alt="Lumen growth platform interface" width={1536} height={1024} className="h-auto w-full" priority />
              </div>
            </Card>
          </div>
        </div>
      </Container>
    </Section>

    <Section id="how-it-works" spacing="tight" className="border-t border-border/70">
      <Container>
        <div className="mx-auto max-w-3xl text-center"><p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-primary uppercase">How Lumen works</p><h2 className="mt-3 text-3xl font-semibold sm:text-4xl">A smarter weekly growth loop.</h2><p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">From insight to action to outcome — one system instead of disconnected marketing tools.</p></div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, description }) => <div key={title} className="bg-card px-6 py-7"><span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary"><Icon className="size-5" /></span><h3 className="mt-5 text-base font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></div>)}
        </div>
      </Container>
    </Section>

    <Section id="platform" className="border-t border-border/70">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div className="max-w-2xl"><p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-primary uppercase">Why Lumen</p><h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Less AI output. More useful work.</h2><p className="mt-4 text-base leading-7 text-muted-foreground">Lumen is designed around the decisions that follow a business insight: what to do, why it matters, what to expect, and what to measure next.</p></div>
          <Card className="rounded-3xl"><CardContent className="p-7"><ul className="space-y-4">{["Built around a weekly growth loop, not a generic chat box", "Evidence and expected results stay visible beside recommendations", "Your business context stays in your workspace"].map((point) => <li key={point} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground"><CheckCircle2 className="mt-1 size-4 shrink-0 text-success" /><span>{point}</span></li>)}</ul></CardContent></Card>
        </div>
      </Container>
    </Section>

    <Section id="pricing" spacing="tight" className="border-t border-border/70">
      <Container>
        <div className="mx-auto max-w-3xl"><div className="mb-8 text-center"><p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-primary uppercase">Pricing</p><h2 className="mt-3 text-3xl font-semibold">One plan. One weekly habit.</h2></div>
          <Card variant="glow" className="overflow-hidden rounded-3xl"><CardContent className="flex flex-col gap-8 p-8 sm:p-10 md:flex-row md:items-center md:justify-between"><div><div className="flex items-baseline gap-2"><span className="font-display text-5xl font-semibold">{PLAN.priceLabel}</span><span className="text-sm text-muted-foreground">/ month</span></div><p className="mt-2 text-sm text-muted-foreground">Early-access pricing for the global launch.</p><ul className="mt-5 space-y-2">{PLAN.points.map((point) => <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />{point}</li>)}</ul></div><div className="shrink-0 md:text-right"><Button asChild size="lg"><Link href="/signup">Start free <ArrowRight /></Link></Button><p className="mt-2 text-xs text-muted-foreground">Create an account before you subscribe.</p></div></CardContent></Card>
        </div>
      </Container>
    </Section>
  </>;
}
