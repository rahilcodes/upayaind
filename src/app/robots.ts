import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/utils";

/** SPEC §6.1: portals and API are never crawled. */
export default function robots(): MetadataRoute.Robots {
  const production = (process.env.VERCEL_ENV ?? "production") === "production";
  return {
    rules: production
      ? [{ userAgent: "*", allow: "/", disallow: ["/app", "/work", "/admin", "/coach", "/api", "/2fa", "/reset-password", "/verify-email", "/invite", "/login/magic", "/signup/complete", "/offline", "/403"] }]
      : [{ userAgent: "*", disallow: "/" }], // preview/staging deployments
    sitemap: absoluteUrl("/sitemap.xml"),
    host: absoluteUrl("/").replace(/\/$/, ""),
  };
}
