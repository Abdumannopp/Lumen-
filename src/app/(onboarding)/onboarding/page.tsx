import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { countProjects } from "@/lib/projects/queries";

/**
 * Forced dynamic: this page's only job is to branch on how many projects exist,
 * which it reads from the database without touching cookies or headers. Without
 * this, Next prerenders it and the check freezes at whatever the build machine
 * saw — the redirect would never re-evaluate for a real install.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Get started",
  description: "Set up your first business in Lumen.",
};

/**
 * First-run setup.
 *
 * Only reachable while the install is empty. Once any project exists this
 * redirects to the dashboard, so onboarding cannot be re-entered by URL and
 * become a second, divergent way to create projects.
 */
export default async function OnboardingPage() {
  const { total } = await countProjects();

  if (total > 0) redirect("/overview");

  return <OnboardingWizard />;
}
