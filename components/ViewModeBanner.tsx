"use client";

import { useAuth } from "@/lib/useAuth";

/**
 * Persistent banner shown at the top of every page when an admin has switched
 * their UI into "view as user" mode. Lets them return to admin view in one
 * click. Mounted globally in app/layout.tsx.
 */
export default function ViewModeBanner() {
  const { isRealAdmin, viewMode, setViewMode, loading } = useAuth();
  if (loading || !isRealAdmin || viewMode !== "user") return null;

  return (
    <div className="fixed left-0 right-0 top-0 z-50">
      <div className="flex items-center justify-center gap-3 bg-flex-accent px-4 py-2 text-xs font-semibold text-white shadow-glow backdrop-blur">
        <span className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 animate-pulseGlow rounded-full bg-white" />
          Mode aperçu · Tu vois AIflex comme un créateur lambda
        </span>
        <button
          type="button"
          onClick={() => setViewMode("admin")}
          className="rounded-full bg-black/30 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest backdrop-blur transition hover:bg-black/50"
        >
          ↩ Revenir en admin
        </button>
      </div>
    </div>
  );
}
