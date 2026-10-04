import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Lumen terms of service draft for launch review.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-6 py-16 sm:px-10">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Trust</p>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Launch draft — legal review and final commercial terms are required before production publication.</p>
      </header>

      <div className="space-y-7 text-sm leading-7 text-muted-foreground">
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Service</h2><p>Lumen provides growth-planning, analytics, AI-assisted recommendations, and related workspace features. Features may evolve, and outputs are decision support rather than a guarantee of business results.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Accounts</h2><p>You are responsible for maintaining access to your account and for the business information and instructions you provide. Do not upload data you are not authorized to use.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">AI outputs</h2><p>AI-generated recommendations may be incomplete or wrong. You remain responsible for reviewing decisions, claims, budgets, targeting, publishing, and compliance before taking action.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Billing</h2><p>Paid subscriptions are processed by our configured payment provider. The production version of these terms must state price, renewal, cancellation, refund, tax, and failed-payment rules that match the Paddle configuration.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Acceptable use</h2><p>You may not misuse the service, attempt to access another workspace, circumvent usage limits, interfere with the service, or use the product for unlawful activity.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Contact</h2><p>For support or legal notices, use the contact address configured for the production deployment. Final terms should include the legal entity, governing law, liability language, and dispute process before launch.</p></section>
      </div>
    </article>
  );
}
