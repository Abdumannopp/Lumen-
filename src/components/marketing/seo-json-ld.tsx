import { siteConfig } from "@/config/site";

export function MarketingStructuredData({
  pageTitle,
  pageDescription,
  breadcrumbs = [],
  pagePath = "/",
  includeSoftware = false,
}: {
  pageTitle: string;
  pageDescription: string;
  breadcrumbs?: { name: string; path: string }[];
  pagePath?: string;
  includeSoftware?: boolean;
}) {
  const pageUrl = new URL(pagePath, siteConfig.url).toString();
  const graph = [
    {
      "@type": "WebSite",
      "@id": `${siteConfig.url}/#website`,
      url: siteConfig.url,
      name: siteConfig.name,
      description: siteConfig.description,
    },
    {
      "@type": "WebPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: pageTitle,
      description: pageDescription,
      inLanguage: siteConfig.locale.split("-")[0],
      isPartOf: { "@id": `${siteConfig.url}/#website` },
    },
    ...(breadcrumbs.length
      ? [
          {
            "@type": "BreadcrumbList",
            itemListElement: breadcrumbs.map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: item.name,
              item: new URL(item.path, siteConfig.url).toString(),
            })),
          },
        ]
      : []),
    ...(includeSoftware
      ? [
          {
            "@type": "SoftwareApplication",
            name: siteConfig.name,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: siteConfig.url,
            description: siteConfig.description,
          },
          {
            "@type": "Organization",
            name: siteConfig.name,
            url: siteConfig.url,
          },
        ]
      : []),
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}
