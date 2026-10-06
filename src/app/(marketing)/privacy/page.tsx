import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Lumen privacy policy draft for launch review.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-6 py-16 sm:px-10">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Trust</p>
        <h1 className="font-display text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Launch draft — review with qualified privacy counsel before production publication.</p>
      </header>

      <div className="space-y-7 text-sm leading-7 text-muted-foreground">
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">What we collect</h2><p>Lumen collects account information, workspace and business context you provide, product activity needed to operate the service, billing identifiers supplied by Paddle, and the performance figures you enter, such as spend, clicks, leads and customers.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Product analytics</h2><p>Lumen uses first-party product events to understand activation, retention, recommendation adoption, task execution, and outcomes. We avoid storing passwords, payment card data, or full query strings in product telemetry.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Marketing attribution</h2><p>With your consent, Lumen stores a small first-party cookie containing campaign/referral attribution such as source, medium, campaign, landing path, and referrer host. Declining attribution does not disable the product.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">AI providers</h2><p>When AI features are enabled, Lumen sends the minimum business context required for the requested AI operation to the configured provider. The exact provider and retention terms must be reviewed and disclosed for the production configuration before launch.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Service providers</h2><p>Lumen may use infrastructure, authentication, email, payment, analytics, and AI providers to operate the service. A production subprocessor list and applicable data-processing terms must be finalized before public launch.</p></section>
        <section><h2 className="mb-2 text-lg font-semibold text-foreground">Your choices</h2><p>You may decline optional attribution, request access or deletion where applicable, and contact support about privacy questions. The final production policy should state the legal basis, retention periods, international-transfer mechanism, and jurisdiction-specific rights that apply to your deployment.</p></section>
      </div>
    </article>
  );
}
