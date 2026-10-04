import Link from "next/link";
import { AuroraBackdrop } from "@/components/brand/aurora-backdrop";
import { Logo } from "@/components/brand/logo";
import { requireUserOrRedirect } from "@/lib/auth/dal";

/**
 * Onboarding shell: a single centred column with no product chrome.
 *
 * Deliberately free of the sidebar and project switcher — during setup there is
 * exactly one task on screen, and there is not yet a project to navigate to.
 *
 * Signed in, though: setup creates a project, a project belongs to a workspace,
 * and a workspace belongs to somebody. Sending an unauthenticated visitor to
 * the sign-in page is kinder than letting them fill in a form that cannot be
 * saved.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireUserOrRedirect();

  return (
    <div className="flex min-h-dvh flex-col">
      <AuroraBackdrop grid={false} />

      <div className="flex justify-center px-6 pt-10">
        <Link href="/" className="rounded-md">
          <Logo />
        </Link>
      </div>

      <main id="main" className="flex flex-1 items-start justify-center px-5 py-12 sm:px-6">
        <div className="w-full max-w-xl">{children}</div>
      </main>
    </div>
  );
}
