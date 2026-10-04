import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/layout/container";
import { Section } from "@/components/feedback/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarketingStructuredData } from "@/components/marketing/seo-json-ld";
import { findSeoPage, industryPages } from "@/config/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return industryPages.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = findSeoPage(industryPages, slug);
  if (!page) return {};
  const canonical = `/industries/${page.slug}`;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical },
    openGraph: { title: page.title, description: page.description, url: canonical, type: "website" },
    twitter: { title: page.title, description: page.description },
  };
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findSeoPage(industryPages, slug);
  if (!page) notFound();

  return (
    <>
      <MarketingStructuredData
        pageTitle={page.title}
        pageDescription={page.description}
        pagePath={`/industries/${page.slug}`}
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Industries", path: "/industries" },
          { name: page.title, path: `/industries/${page.slug}` },
        ]}
      />
      <Section spacing="loose" className="pt-20 sm:pt-24">
        <Container>
          <div className="mx-auto max-w-4xl text-center">
            <Badge variant="accent">{page.eyebrow}</Badge>
            <h1 className="mt-7 text-4xl leading-[1.04] font-semibold sm:text-5xl lg:text-6xl">{page.title}</h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-xl">{page.summary}</p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg"><Link href="/signup">Start with your business</Link></Button>
              <Button asChild variant="outline" size="lg"><Link href="/">See how Lumen works</Link></Button>
            </div>
          </div>
          <div className="mx-auto mt-14 grid max-w-4xl gap-3 md:grid-cols-3">
            {page.outcomes.map((outcome) => (
              <Card key={outcome}><CardContent className="p-5 text-sm leading-relaxed text-muted-foreground">{outcome}</CardContent></Card>
            ))}
          </div>
        </Container>
      </Section>
      <Section className="border-t border-border/60">
        <Container>
          <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-3">
            {page.sections.map((section) => {
              const Icon = section.icon;
              return (
                <Card key={section.title}>
                  <CardContent className="p-6">
                    <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-secondary text-[color:var(--gradient-from)]"><Icon className="size-[1.125rem]" /></span>
                    <h2 className="mt-5 text-lg font-semibold">{section.title}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </Container>
      </Section>
      <Section spacing="tight" className="border-t border-border/60">
        <Container>
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-center sm:p-10">
            <p className="font-mono text-[0.6875rem] tracking-[0.2em] text-muted-foreground uppercase">Start with the business you already run</p>
            <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">A focused weekly system beats another tab full of ideas.</h2>
            <Button asChild size="lg" className="mt-7"><Link href="/signup">Start free</Link></Button>
          </div>
        </Container>
      </Section>
    </>
  );
}
