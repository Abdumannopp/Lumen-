import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

const privatePrefixes = [
  "/overview",
  "/plan",
  "/assistant",
  "/intelligence",
  "/strategy",
  "/audience",
  "/content",
  "/campaigns",
  "/budget",
  "/analytics",
  "/growth",
  "/projects",
  "/settings",
  "/admin",
  "/api",
  "/auth",
  "/login",
  "/signup",
  "/forgot-password",
  "/update-password",
  "/onboarding",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: privatePrefixes }],
    sitemap: new URL("/sitemap.xml", siteConfig.url).toString(),
  };
}
