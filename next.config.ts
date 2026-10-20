import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";
// HTTPS-only directives are tied to the public origin, so a production build served over plain
// http (e.g. a VPS test box before its certificate exists) still loads its own assets and forms.
const httpsOrigin = (process.env.NEXT_PUBLIC_APP_URL ?? "https://").startsWith("https://");

/**
 * Content Security Policy (SPEC §10). Third parties: Stripe (checkout redirect +
 * js), GA4, Microsoft Clarity, Cal.com embed, Google Fonts are self-hosted via
 * next/font. 'unsafe-inline' for scripts is required by Next.js inline
 * bootstrapping without per-request nonces (which would disable static pages).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://www.googletagmanager.com https://www.clarity.ms https://*.clarity.ms https://app.cal.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://www.google-analytics.com https://*.clarity.ms https://icons.duckduckgo.com https://www.google.com https://*.gstatic.com https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""} https://*.r2.cloudflarestorage.com https://api.stripe.com https://www.google-analytics.com https://*.analytics.google.com https://*.clarity.ms https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://app.cal.com`,
  "frame-src https://js.stripe.com https://checkout.stripe.com https://app.cal.com https://cal.com https://www.youtube-nocookie.com https://player.vimeo.com 'self'",
  "frame-ancestors 'none'",
  "form-action 'self' https://checkout.stripe.com https://accounts.google.com",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev || !httpsOrigin ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  ...(httpsOrigin ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@react-pdf/renderer", "pdf-parse", "@node-rs/argon2", "exceljs"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "icons.duckduckgo.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Old-site redirects (SPEC §18).
  async redirects() {
    return [
      { source: "/signin", destination: "/login", permanent: true },
      { source: "/services", destination: "/how-it-works", permanent: true },
      { source: "/employee/profile", destination: "/work", permanent: true },
      { source: "/employee/:path*", destination: "/work", permanent: true },
    ];
  },
};

/**
 * Sentry (DECISIONS D-130). Source maps are uploaded only when SENTRY_AUTH_TOKEN
 * is set (CI release builds); otherwise the plugin only injects the runtime
 * configs. Browser events go through the same-origin `/monitoring` tunnel so
 * ad-blockers don't drop them (already covered by connect-src 'self').
 */
const sentryEnabled = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
const sentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  tunnelRoute: sentryEnabled ? "/monitoring" : undefined,
  widenClientFileUpload: sentryUpload,
  sourcemaps: { disable: !sentryUpload, deleteSourcemapsAfterUpload: true },
  bundleSizeOptimizations: { excludeDebugStatements: true, excludeReplayIframe: true, excludeReplayShadowDom: true, excludeReplayWorker: true },
});
