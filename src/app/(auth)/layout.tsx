import type { Metadata } from "next";

import Link from "next/link";

import { AuroraBackdrop } from "@/components/brand/aurora-backdrop";
import { Logo } from "@/components/brand/logo";

/**
 * Account shell: one centred column, no product chrome.
 *
 * Deliberately does no redirecting. The obvious version — "signed in? go to the
 * product" — is wrong here, because `/update-password` lives in this group and
 * is reached *with* a session: a recovery link signs you in precisely so you
 * can set a new password. A layout-level redirect would bounce every person
 * resetting their password away from the form they were sent to.
 *
 * So the three pages that should turn a signed-in visitor away call
 * `redirectIfSignedIn()` themselves. That is a courtesy in any case, not a
 * control — what protects data is the Data Access Layer, which every action
 * calls regardless of which layout rendered it.
 */
export const metadata: Metadata = { robots: { index: false, follow: false }, };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AuroraBackdrop grid={false} />

      <div className="flex justify-center px-6 pt-10">
        <Link href="/" className="rounded-md">
          <Logo />
        </Link>
      </div>

      <main id="main" className="flex flex-1 items-start justify-center px-5 py-12 sm:px-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
