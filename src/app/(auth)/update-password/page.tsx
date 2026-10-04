import type { Metadata } from "next";

import { AuthForm, AuthLink } from "@/components/auth/auth-form";
import { Card, CardContent } from "@/components/ui/card";
import { updatePasswordAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Set a new password",
  description: "Choose a new password for your Lumen account.",
};

/**
 * Reached from a recovery email, with a session already established by
 * `/auth/confirm`. That session is the proof: it exists only because the person
 * followed a one-use link sent to the address on the account.
 *
 * Which is why this page does not ask for the old password, and why it is the
 * one page in this group a signed-in visitor is allowed to see.
 */
export default async function UpdatePasswordPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Card>
        <CardContent className="space-y-4 p-8">
          <h1 className="font-display text-xl font-semibold">That link is no longer valid</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Reset links can be used once, and they expire. Ask for a new one and it will arrive in
            a moment.
          </p>
          <p className="text-sm">
            <AuthLink href="/forgot-password">Send a new link</AuthLink>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <AuthForm
      action={updatePasswordAction}
      title="Set a new password"
      description={`Choose a new password for ${user.email}.`}
      submitLabel="Save the new password"
      pendingLabel="Saving…"
      fields={[
        {
          name: "password",
          label: "New password",
          type: "password",
          autoComplete: "new-password",
          hint: "At least 12 characters.",
        },
      ]}
      footer={<AuthLink href="/overview">Go to your workspace</AuthLink>}
    />
  );
}
