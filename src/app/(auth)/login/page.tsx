import type { Metadata } from "next";

import { AuthForm, AuthLink } from "@/components/auth/auth-form";
import { signInAction } from "@/lib/auth/actions";
import { redirectIfSignedIn } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Lumen workspace.",
};

/**
 * Notices arriving from elsewhere.
 *
 * A confirmation link that has expired sends the person here, and they need to
 * be told why rather than seeing a bare form they thought they were past. The
 * query string chooses between fixed strings — it never supplies the text, or
 * the URL would be a way to put words on our page.
 */
const NOTICES: Record<string, string> = {
  confirmed: "Your email is confirmed. Sign in to continue.",
  expired: "That link has expired or has already been used. Sign in, or ask for a new one.",
  "password-updated": "Your password has been changed. Sign in with the new one.",
  "signed-out": "You are signed out.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfSignedIn();

  const notice = NOTICES[String((await searchParams).notice ?? "")];

  return (
    <div className="space-y-4">
      {notice && (
        <p className="rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      <AuthForm
        action={signInAction}
        title="Sign in"
        description="Your workspace, your projects, your plan for the week."
        submitLabel="Sign in"
        pendingLabel="Signing in…"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <AuthLink href="/forgot-password">Forgot your password?</AuthLink>
            <span>
              No account? <AuthLink href="/signup">Create one</AuthLink>
            </span>
          </div>
        }
      />
    </div>
  );
}
