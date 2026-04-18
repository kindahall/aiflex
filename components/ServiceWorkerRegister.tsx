"use client";

import { useEffect } from "react";

/**
 * Proactively registers the service worker for offline support and caching.
 * This runs independently of push notification opt-in.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

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
