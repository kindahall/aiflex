"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The old localStorage-backed library has been superseded by /dashboard.
 * Redirect for back-compat.
 */
export default function LegacyLibraryRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return null;
}
