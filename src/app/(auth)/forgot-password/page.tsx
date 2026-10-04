import type { Metadata } from "next";

import { AuthForm, AuthLink } from "@/components/auth/auth-form";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import { redirectIfSignedIn } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "Send yourself a link to set a new Lumen password.",
};

export default async function ForgotPasswordPage() {
  await redirectIfSignedIn();

  return (
    <AuthForm
      action={requestPasswordResetAction}
      title="Reset your password"
      description="Give us the address on your account and we will send a link for setting a new password."
      submitLabel="Send the link"
      pendingLabel="Sending…"
      fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
      footer={
        <span>
          Remembered it? <AuthLink href="/login">Sign in</AuthLink>
        </span>
      }
    />
  );
}
