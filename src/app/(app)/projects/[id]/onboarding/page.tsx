import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { BusinessOnboardingFlow } from "@/components/business-profile/onboarding-flow";
import { getBusinessContext } from "@/lib/business-profile/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const context = await getBusinessContext(id);
  return { title: context ? `Onboarding · ${context.project.name}` : "Onboarding" };
}

/**
 * Business onboarding for a single project.
 *
 * Resumes wherever the person left off: `lastStep` is written on every save, so
 * closing the tab mid-flow and coming back lands on the same question rather
 * than restarting the interview.
 */
export default async function ProjectOnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const context = await getBusinessContext(id);

  if (!context) notFound();

  const { project, profile, completion } = context;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        eyebrow={completion.resumeStep > 0 ? "Resuming onboarding" : "Business onboarding"}
        title={project.name}
        description="Answers are saved automatically as you go. Optional questions can be skipped."
      />

      <BusinessOnboardingFlow
        projectId={project.id}
        initialStep={completion.resumeStep}
        defaults={{
          name: project.name,
          website: project.website ?? "",
          industry: project.industry,
          country: project.country,
          targetMarkets: project.targetMarkets,
          description: project.description ?? "",
          businessStage: project.businessStage,
          primaryGoal: project.primaryGoal,
          productOrService: profile?.productOrService ?? "",
          businessModel: profile?.businessModel ?? "",
          targetCustomers: profile?.targetCustomers ?? "",
          currentMarketingChannels: profile?.currentMarketingChannels ?? [],
          monthlyBudgetAmount:
            profile?.monthlyBudgetAmount != null ? String(profile.monthlyBudgetAmount) : "",
          monthlyBudgetCurrency: profile?.monthlyBudgetCurrency ?? "",
          currentChallenges: profile?.currentChallenges ?? [],
          knownCompetitors: profile?.knownCompetitors ?? [],
          brandVoice: profile?.brandVoice ?? [],
          notes: profile?.notes ?? "",
          socials: {
            linkedinUrl: profile?.linkedinUrl ?? "",
            xUrl: profile?.xUrl ?? "",
            instagramUrl: profile?.instagramUrl ?? "",
            facebookUrl: profile?.facebookUrl ?? "",
            youtubeUrl: profile?.youtubeUrl ?? "",
            tiktokUrl: profile?.tiktokUrl ?? "",
          },
        }}
      />
    </div>
  );
}
