import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security",
  description: "How Lumen approaches application and data security.",
  alternates: { canonical: "/security" },
};

export default function SecurityPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-6 py-16 sm:px-10">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Trust</p>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">A factual overview of the controls currently built into Lumen; this page is not a certification claim.</p>
      </header>

      <div className="space-y-7 text-sm leading-7 text-muted-foreground">
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Workspace isolation</h2><p>Server-side authorization checks the authenticated membership before reading or changing project, analytics, billing, plan, and outcome data.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Authentication</h2><p>Production deployments are configured to use Supabase authentication rather than the local development provider. Session and workspace cookies are treated as claims and re-checked against membership.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Payments</h2><p>Paddle webhook signatures are verified before subscription entitlements are changed, and replay/retry handling is designed to tolerate duplicate and out-of-order delivery.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Application hardening</h2><p>Lumen ships security headers, rate limiting, external-request timeouts, protected development endpoints, noindex controls for private routes, and production fail-closed environment checks.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Security reporting</h2><p>Report suspected security issues through the production security contact published in <code className="rounded bg-muted px-1.5 py-0.5">/.well-known/security.txt</code>. Never include passwords, API keys, payment card data, or other secrets in a report.</p></section>
      </div>
    </article>
  );
}
