import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/sora";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { siteConfig } from "@/config/site";
import { getSettings } from "@/lib/settings/queries";

async function getThemeSafely(): Promise<string> {
  try { return (await getSettings()).theme; } catch { return "light"; }
}

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: `${siteConfig.name} — ${siteConfig.tagline}`, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  openGraph: { type: "website", siteName: siteConfig.name, title: `${siteConfig.name} — ${siteConfig.tagline}`, description: siteConfig.description, url: siteConfig.url },
  twitter: { card: "summary_large_image", title: `${siteConfig.name} — ${siteConfig.tagline}`, description: siteConfig.description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#f7f8fc", colorScheme: "light dark", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getThemeSafely();
  return <html lang="en" data-theme={theme} suppressHydrationWarning><body className="min-h-dvh antialiased"><a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-popover focus:px-4 focus:py-2 focus:text-sm">Skip to content</a>{children}<Toaster /></body></html>;
}
