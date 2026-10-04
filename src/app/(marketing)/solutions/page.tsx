import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/feedback/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MarketingStructuredData } from "@/components/marketing/seo-json-ld";
import { solutionPages } from "@/config/seo";

export const metadata: Metadata = {
  title: "Solutions for weekly growth",
  description: "Explore Lumen solutions for weekly growth planning, marketing analytics and a connected growth workflow.",
  alternates: { canonical: "/solutions" },
};

export default function SolutionsPage() {
  return (
    <>
      <MarketingStructuredData pageTitle="Solutions for weekly growth" pageDescription={String(metadata.description)} pagePath="/solutions" breadcrumbs={[{ name: "Home", path: "/" }, { name: "Solutions", path: "/solutions" }]} />
      <Section spacing="loose" className="pt-20 sm:pt-24">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="accent">Lumen solutions</Badge>
            <h1 className="mt-7 text-4xl font-semibold sm:text-5xl">A growth system for the work after the insight.</h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">Choose the workflow that matches the problem your team is solving, then connect it to a repeatable weekly loop.</p>
          </div>
          <div className="mx-auto mt-12 grid max-w-5xl gap-4 md:grid-cols-3">
            {solutionPages.map((page) => (
              <Link key={page.slug} href={`/solutions/${page.slug}`} className="group">
                <Card className="h-full transition-transform group-hover:-translate-y-0.5">
                  <CardContent className="p-6"><p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted-foreground uppercase">{page.eyebrow}</p><h2 className="mt-4 text-lg font-semibold">{page.title}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{page.description}</p></CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
