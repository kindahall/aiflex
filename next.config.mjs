import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Strict hostnames only — never a wildcard on a provider we don't
    // control. Each entry is pinned to a specific pathname scope when
    // possible so a takeover of /tmp/* on fal.media can't be abused to
    // poison the Next.js image optimizer cache.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      { protocol: "https", hostname: "fal.media", pathname: "/files/**" },
      { protocol: "https", hostname: "v3.fal.media", pathname: "/files/**" },
      { protocol: "https", hostname: "v2.fal.media", pathname: "/files/**" },
      { protocol: "https", hostname: "cdn.fal.media", pathname: "/files/**" },
    ],
    // Cap image optimizer concurrency to protect memory on multi-tenant
    // hosts.
    minimumCacheTTL: 60,
  },
};

// Sentry wrapper is a no-op when SENTRY_AUTH_TOKEN is absent — safe in dev.
export default withSentryConfig(nextConfig, {
  silent: !process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  sourcemaps: { disable: false },
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: false,
  },
});
