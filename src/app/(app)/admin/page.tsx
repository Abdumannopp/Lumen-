import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { AdminWorkspace } from "@/components/beta/admin-workspace";
import { ProductAnalytics } from "@/components/beta/product-analytics";
import { AIEvaluation } from "@/components/beta/ai-evaluation";
import { AcquisitionAnalytics } from "@/components/beta/acquisition-analytics";
import { Card, CardContent } from "@/components/ui/card";
import { requireFounderView } from "@/lib/beta/queries";
import { getProductAnalytics } from "@/lib/beta/product-analytics";
import { getFounderAILearningSignals } from "@/lib/ai/learning-loop";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Beta",
};

/**
 * Running the beta.
 *
 * Answers `notFound()` rather than "you are not allowed here", because a page
 * that says "forbidden" has confirmed the page exists. A beta admin surface is
 * worth guessing at; one that does not appear to exist is not.
 *
 * The page's guard is navigation, not protection: every action it renders
 * re-checks the founder list on the server, because a Server Action is a public
 * endpoint whatever page it was rendered on.
 */
export default async function AdminPage() {
  const view = await requireFounderView();

  if (!view) notFound();

  const [productAnalytics, aiLearning] = await Promise.all([getProductAnalytics(), getFounderAILearningSignals()]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Beta"
        title="Who is in"
        description="Invites, accounts and what people have told us. Only founders can open this."
      />

      <AdminWorkspace
        invites={view.invites}
        users={view.users}
        currentUserId={view.context.userId}
      />

      {productAnalytics && <ProductAnalytics analytics={productAnalytics} />}

      {productAnalytics && <AcquisitionAnalytics acquisition={productAnalytics.acquisition} />}

      {aiLearning && <AIEvaluation signals={aiLearning} />}

      <section className="space-y-4">
        <h2 className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted-foreground uppercase">
          Feedback
        </h2>

        <Card>
          <CardContent className="space-y-4 p-6">
            {view.feedback.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              view.feedback.map((entry) => (
                <div key={entry.id} className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0">
                  <p className="font-mono text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">
                    {entry.createdAt.toISOString().slice(0, 10)}
                  </p>
                  {[
                    ["Where onboarding stalled", entry.onboardingFriction],
                    ["Most useful task", entry.mostUseful],
                    ["Wrong or unclear", entry.leastUseful],
                    ["Marking done or skipped", entry.statusEase],
                    ["Did it make marketing easier", entry.overall],
                  ]
                    .filter(([, answer]) => answer)
                    .map(([label, answer]) => (
                      <p key={label} className="text-sm leading-relaxed">
                        <span className="text-muted-foreground">{label}: </span>
                        {answer}
                      </p>
                    ))}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
