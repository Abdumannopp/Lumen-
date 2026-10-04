"use client";

import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { ACQUISITION_CONSENT_EVENT, CONSENT_COOKIE, CONSENT_MAX_AGE } from "@/config/consent";

function readConsent(): "accepted" | "declined" | null {
  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  const value = entry?.slice(CONSENT_COOKIE.length + 1);
  return value === "accepted" || value === "declined" ? value : null;
}

function writeConsent(value: "accepted" | "declined") {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(ACQUISITION_CONSENT_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(ACQUISITION_CONSENT_EVENT, onChange);
  return () => window.removeEventListener(ACQUISITION_CONSENT_EVENT, onChange);
}

export function CookieConsent() {
  // The cookie is the source of truth; writeConsent() dispatches the event that
  // re-reads it. The server cannot see document.cookie, so it renders as "no
  // choice yet", exactly as before.
  const consent = useSyncExternalStore(subscribe, readConsent, () => null);

  if (consent) return null;

  return (
    <aside
      aria-label="Analytics consent"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-2xl rounded-2xl border border-border-strong bg-popover/95 p-4 shadow-2xl backdrop-blur-xl"
    >
      <div className="space-y-3 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:space-y-0">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Lumen uses a small first-party attribution cookie to understand which campaigns and referrals lead to signups. Product functionality works without it. See our <a className="underline underline-offset-4 hover:text-foreground" href="/privacy">privacy policy</a>.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => writeConsent("declined")}>
            Decline
          </Button>
          <Button size="sm" onClick={() => writeConsent("accepted")}>
            Allow attribution
          </Button>
        </div>
      </div>
    </aside>
  );
}
