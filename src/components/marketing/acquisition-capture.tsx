"use client";

import { useEffect } from "react";

import { ACQUISITION_CONSENT_EVENT, CONSENT_COOKIE } from "@/config/consent";

const COOKIE_NAME = "lumen.acquisition.v1";
const MAX_AGE = 60 * 60 * 24 * 90;
const MAX_VALUE = 180;

function clean(value: string | null) {
  return value?.trim().slice(0, MAX_VALUE) || undefined;
}

function readConsent() {
  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  const value = entry?.slice(CONSENT_COOKIE.length + 1);
  return value === "accepted";
}

function clearCookie() {
  document.cookie = `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
}

function readCookie() {
  const entry = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!entry) return null;
  try {
    return JSON.parse(decodeURIComponent(entry.slice(COOKIE_NAME.length + 1))) as Record<string, string>;
  } catch {
    return null;
  }
}

function classifyReferrer(hostname: string) {
  const host = hostname.toLowerCase();
  if (/(^|\.)google\.[a-z.]+$/.test(host) || host.endsWith("bing.com") || host.endsWith("duckduckgo.com") || host.endsWith("yahoo.com")) {
    return { source: host.replace(/^www\./, ""), medium: "organic" };
  }
  if (host.endsWith("linkedin.com") || host.endsWith("x.com") || host.endsWith("twitter.com") || host.endsWith("facebook.com") || host.endsWith("instagram.com") || host.endsWith("tiktok.com")) {
    return { source: host.replace(/^www\./, ""), medium: "social" };
  }
  return { source: host.replace(/^www\./, ""), medium: "referral" };
}

function writeCookie(value: Record<string, string>) {
  const encoded = encodeURIComponent(JSON.stringify(value));
  if (encoded.length > 3800) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=${encoded}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

export function AcquisitionCapture() {
  useEffect(() => {
    const capture = () => {
      if (!readConsent()) {
        clearCookie();
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const fields = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
      const fresh: Record<string, string> = {};
      for (const field of fields) {
        const value = clean(params.get(field));
        if (value) fresh[field.replace("utm_", "")] = value;
      }

      const current = readCookie() ?? {};
      const hasCampaignTouch = Object.keys(fresh).length > 0;
      if (!hasCampaignTouch && Object.keys(current).length > 0) return;

      const attribution: Record<string, string> = {
        ...current,
        ...fresh,
        landingPath: window.location.pathname.slice(0, MAX_VALUE),
        capturedAt: new Date().toISOString(),
      };

      if (!current.referrerHost && document.referrer) {
        try {
          const host = new URL(document.referrer).hostname;
          if (host && host !== window.location.hostname) {
            attribution.referrerHost = host.slice(0, MAX_VALUE);
            if (!attribution.source) {
              const classified = classifyReferrer(host);
              attribution.source = classified.source;
              attribution.medium = classified.medium;
            }
          }
        } catch {
          // Referrer is optional and never blocks acquisition capture.
        }
      }

      writeCookie(attribution);
    };

    capture();
    window.addEventListener(ACQUISITION_CONSENT_EVENT, capture);
    return () => window.removeEventListener(ACQUISITION_CONSENT_EVENT, capture);
  }, []);

  return null;
}
