"use client";

import { useEffect } from "react";

interface Props {
  variant: string;
}

/**
 * Fires a `landing_view` event with the variant + UTM params on mount.
 * Pure client-side — no Next.js cookies API since landings are static.
 *
 * The event handler is the global PostHog snippet (or a noop in dev).
 */
export default function LandingTracker({ variant }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const properties = {
        variant,
        utm_source: params.get("utm_source") ?? null,
        utm_campaign: params.get("utm_campaign") ?? null,
        utm_medium: params.get("utm_medium") ?? null,
        utm_content: params.get("utm_content") ?? null,
        ref: params.get("ref") ?? null,
      };
      // PostHog browser snippet drops a global. We avoid hard-typing it
      // since the script may not be installed in dev.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ph = (window as any).posthog;
      if (ph?.capture) {
        ph.capture("landing_view", properties);
      }
      // Also POST to a tiny beacon for server-side analytics. Best-effort.
      fetch("/api/landing/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(properties),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* no-op */
    }
  }, [variant]);

  return null;
}
