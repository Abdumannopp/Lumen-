import type { Metadata } from "next";

import { AuthForm, AuthLink } from "@/components/auth/auth-form";
import { signUpAction } from "@/lib/auth/actions";
import { redirectIfSignedIn } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a Lumen account and start your workspace.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfSignedIn();

  // The token from the invitation link. Carried into the form and verified on
  // submit — nothing here checks it, because a page that reported "that invite
  // is not valid" before anyone typed anything would be a way to test tokens.
  const invite = String((await searchParams).invite ?? "");

  return (
    <AuthForm
      action={signUpAction}
      title="Create your account"
      description="One account, one workspace. Everything you add stays inside it."
      hidden={invite ? { invite } : undefined}
      submitLabel="Create account"
      pendingLabel="Creating your account…"
      terms
      fields={[
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        {
          name: "password",
          label: "Password",
          type: "password",
          autoComplete: "new-password",
          hint: "At least 12 characters. A phrase you can remember beats a short password with symbols in it.",
        },
      ]}
      footer={
        <span>
          Already have an account? <AuthLink href="/login">Sign in</AuthLink>
        </span>
      }
    />
  );
}
