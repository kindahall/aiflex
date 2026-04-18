"use client";

import { useEffect } from "react";

/**
 * Proactively registers the service worker for offline support and caching.
 * This runs independently of push notification opt-in.
 *
 * DEV MODE: registration is skipped and any previously-installed SW is
 * unregistered. Next's dev chunks use stable filenames (no content hash),
 * so a cache-first SW would keep serving stale /_next/static/ bundles
 * after a file edit — causing pages to "regress" to their pre-edit version.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Clean up any SW left over from a previous dev session or an old
      // deploy so cached chunks can't mask our new code.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      return;
    }

    // Register after a short delay to avoid blocking initial page load
    const timer = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Silent failure — SW registration is non-critical
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return null;
}
