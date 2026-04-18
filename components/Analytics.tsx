"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * PostHog analytics loader. Loads the PostHog script tag and tracks
 * page views on every SPA navigation. No-ops when NEXT_PUBLIC_POSTHOG_KEY
 * is not set, so it's safe to include unconditionally in the layout.
 */
export default function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Load PostHog once on mount via script tag
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    if (window.__posthog_loaded) return;
    window.__posthog_loaded = true;

    const host =
      process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

    // Create and inject the PostHog script
    const script = document.createElement("script");
    script.async = true;
    script.src = host.replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/array.js";
    script.onload = () => {
      if (window.posthog) {
        window.posthog.init(key, {
          api_host: host,
          person_profiles: "identified_only",
          capture_pageview: false,
          capture_pageleave: true,
        });
      }
    };
    document.head.appendChild(script);
  }, []);

  // Track page views on route change
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    if (typeof window === "undefined" || !window.posthog) return;

    const url =
      pathname +
      (searchParams?.toString() ? `?${searchParams.toString()}` : "");
    window.posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

// Extend Window for PostHog
declare global {
  interface Window {
    __posthog_loaded?: boolean;
    posthog?: {
      init: (key: string, options: Record<string, unknown>) => void;
      capture: (event: string, properties?: Record<string, unknown>) => void;
      [key: string]: unknown;
    };
  }
}
