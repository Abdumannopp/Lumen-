import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/feedback/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MarketingStructuredData } from "@/components/marketing/seo-json-ld";
import { industryPages } from "@/config/seo";

export const metadata: Metadata = {
  title: "Industries Lumen supports",
  description: "See how Lumen adapts its weekly growth workflow for SaaS, service businesses and ecommerce operators.",
  alternates: { canonical: "/industries" },
};

export default function IndustriesPage() {
  return (
    <>
      <MarketingStructuredData pageTitle="Industries Lumen supports" pageDescription={String(metadata.description)} pagePath="/industries" breadcrumbs={[{ name: "Home", path: "/" }, { name: "Industries", path: "/industries" }]} />
      <Section spacing="loose" className="pt-20 sm:pt-24">
        <Container>
          <div className="mx-auto max-w-3xl text-center"><Badge variant="accent">Built around the business model</Badge><h1 className="mt-7 text-4xl font-semibold sm:text-5xl">Different businesses. One evidence-aware growth loop.</h1><p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">Lumen keeps the core workflow consistent while the examples, constraints and useful metrics change by business.</p></div>
          <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
            {industryPages.map((page) => (
              <Link key={page.slug} href={`/industries/${page.slug}`} className="group">
                <Card className="h-full transition-transform group-hover:-translate-y-0.5"><CardContent className="p-6"><p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">{page.eyebrow}</p><h2 className="mt-4 text-lg font-semibold">{page.title}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{page.description}</p></CardContent></Card>
              </Link>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
