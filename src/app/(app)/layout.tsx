import type { Metadata } from "next";

import { AuroraBackdrop } from "@/components/brand/aurora-backdrop";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectSwitcher } from "@/components/projects/project-switcher";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { requireUserOrRedirect } from "@/lib/auth/dal";
import { BetaBar } from "@/components/beta/beta-bar";
import { getServerEnv } from "@/lib/env";
import { isFounderEmail } from "@/lib/beta/invites";
import { getActiveProject, listProjects } from "@/lib/projects/queries";

/**
 * Application shell.
 *
 * The user is resolved first and on its own, before any data is fetched. Not
 * for security — every query below reaches the Data Access Layer itself, and
 * refuses regardless of what this layout did — but because a visitor who is
 * simply not signed in should land on the sign-in page, not on an error screen
 * produced by a 401 thrown three calls deep.
 *
 * The active project is resolved once here rather than per page, so every
 * surface below this layout agrees on which business it is showing.
 */
export const metadata: Metadata = { robots: { index: false, follow: false }, };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();

  const [projects, activeProject] = await Promise.all([listProjects(), getActiveProject()]);

  return (
    <>
      <AuroraBackdrop />
      <AppShell
        topbarSlot={
          <ProjectSwitcher
            projects={projects.map(({ id, name }) => ({ id, name }))}
            activeProjectId={activeProject?.id ?? null}
          />
        }
        accountSlot={<SignOutForm email={user.email} />}
        betaSlot={<BetaBar supportEmail={getServerEnv().SUPPORT_EMAIL} />}
        founder={isFounderEmail(user.email)}
      >
        {children}
      </AppShell>
    </>
  );
}
