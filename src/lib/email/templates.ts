import { TEMPLATES, type TemplateKey } from "@/config/email";

/**
 * What the emails say.
 *
 * Plain text as well as HTML, always. A text part is not a courtesy to people
 * with old mail clients — it is what stops a message being scored as spam for
 * having no alternative, and it is what a screen reader gets.
 *
 * The writing rule is the same as everywhere else in the product: say the thing
 * and stop. Nobody has ever been glad of a longer welcome email.
 *
 * Neither template takes a token, and neither ever should. Confirmation and
 * reset links are the identity provider's to send; if a token appeared here it
 * would also appear in `EmailMessage`, which is precisely what that table
 * refuses to hold.
 */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface TemplateData {
  welcome: { appUrl: string };
  "password-changed": { appUrl: string; when: string };
}

/**
 * One shell for every message.
 *
 * Deliberately close to plain: a system font, one column, no images and no
 * tracking pixel. Rendered mail is a hostile environment — inline styles only,
 * tables where layout matters — and every clever thing added here is one more
 * client that renders it wrongly.
 */
function shell(body: string, footer: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1917;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 24px;font-size:15px;font-weight:600;letter-spacing:0.02em;">Lumen</p>
    ${body}
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#78716c;">${footer}</p>
</body></html>`;
}

const p = (text: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${text}</p>`;

const button = (href: string, label: string) =>
  `<p style="margin:24px 0 8px;"><a href="${href}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#1c1917;color:#ffffff;text-decoration:none;font-size:14px;">${label}</a></p>`;

export function render<K extends TemplateKey>(
  template: K,
  data: TemplateData[K],
): RenderedEmail {
  switch (template) {
    case TEMPLATES.welcome: {
      const { appUrl } = data as TemplateData["welcome"];

      return {
        subject: "Your Lumen workspace is ready",
        text: [
          "Your Lumen workspace is ready.",
          "",
          "Answer the questions about your business once, and Lumen turns them into a",
          "short list of marketing work you can finish this week. Mark what you did and",
          "what you skipped — next week's plan reads both.",
          "",
          `Start here: ${appUrl}/onboarding`,
          "",
          "If you did not create this account, you can ignore this message.",
        ].join("\n"),
        html: shell(
          [
            p("Your workspace is ready."),
            p(
              "Answer the questions about your business once, and Lumen turns them into a short list of marketing work you can finish this week. Mark what you did and what you skipped — next week&rsquo;s plan reads both.",
            ),
            button(`${appUrl}/onboarding`, "Set up your business"),
          ].join(""),
          "If you did not create this account, you can ignore this message.",
        ),
      };
    }

    case TEMPLATES.passwordChanged: {
      const { appUrl, when } = data as TemplateData["password-changed"];

      return {
        subject: "Your Lumen password was changed",
        text: [
          `Your Lumen password was changed on ${when}.`,
          "",
          "If that was you, there is nothing to do.",
          "",
          "If it was not, reset your password immediately — the reset link is sent to",
          "this address, so whoever changed it cannot stop you.",
          "",
          `${appUrl}/forgot-password`,
        ].join("\n"),
        html: shell(
          [
            p(`Your password was changed on ${when}.`),
            p("If that was you, there is nothing to do."),
            p(
              "If it was not, reset your password immediately. The reset link is sent to this address, so whoever changed it cannot stop you.",
            ),
            button(`${appUrl}/forgot-password`, "Reset your password"),
          ].join(""),
          "You are receiving this because someone changed the password on a Lumen account registered to this address.",
        ),
      };
    }

    default: {
      // Exhaustiveness: adding a template without rendering it fails to compile
      // rather than sending an empty message.
      const exhaustive: never = template;
      throw new Error(`No renderer for template ${String(exhaustive)}`);
    }
  }
}
