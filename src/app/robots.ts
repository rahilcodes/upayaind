import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";

/** SPEC §6.1: portals and API are never crawled. */
export default function robots(): MetadataRoute.Robots {
  const production = (process.env.VERCEL_ENV ?? "production") === "production";
  return {
    rules: production
      ? [{ userAgent: "*", allow: "/", disallow: ["/app", "/work", "/admin", "/api", "/2fa", "/reset-password", "/verify-email", "/invite"] }]
      : [{ userAgent: "*", disallow: "/" }], // preview/staging deployments
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/").replace(/\/$/, ""),
  };
}
