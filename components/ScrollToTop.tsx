"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Scrolls the window to the top on every route change. Next.js App Router
 * doesn't do this automatically for client navigations, which creates a
 * jarring UX where the user lands in the middle of a new page.
 */
export default function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
