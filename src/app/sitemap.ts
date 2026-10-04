import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { industryPages, solutionPages } from "@/config/seo";

const publicPaths = [
  "/",
  "/solutions",
  "/industries",
  "/privacy",
  "/terms",
  "/security",
  ...solutionPages.map((page) => `/solutions/${page.slug}`),
  ...industryPages.map((page) => `/industries/${page.slug}`),
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({
    url: new URL(path, siteConfig.url).toString(),
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/solutions" || path === "/industries" ? 0.8 : 0.7,
  }));
}
