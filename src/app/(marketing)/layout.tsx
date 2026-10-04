import { AuroraBackdrop } from "@/components/brand/aurora-backdrop";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { AcquisitionCapture } from "@/components/marketing/acquisition-capture";
import { CookieConsent } from "@/components/marketing/cookie-consent";
import { MarketingHeader } from "@/components/layout/marketing-header";

/**
 * Public shell. Separate from the application shell because the two have
 * different chrome, different caching characteristics and different auth
 * requirements — which is exactly what route groups are for.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AuroraBackdrop />
      <AcquisitionCapture />
      <CookieConsent />
      <MarketingHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
