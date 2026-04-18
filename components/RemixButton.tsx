"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";

/**
 * "Remix this film" call to action. Creates a new private project that
 * forks the concept from a public film, then redirects the user to their
 * studio to rework it.
 *
 * Unauthenticated visitors see a "connecte-toi" prompt instead.
 */
export default function RemixButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remix() {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/remix`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      router.push(`/studio/${data.project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setBusy(false);
    }
  }

  if (!loading && !user) {
    return (
      <Link
        href={`/login?next=/watch/${projectId}`}
        className="flex items-center gap-2 rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-muted transition hover:border-flex-accent2 hover:text-flex-text"
      >
        ↻ Connecte-toi pour remixer
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={remix}
        disabled={busy || loading}
        className="flex items-center gap-2 rounded-lg border border-flex-accent2/50 bg-flex-accent2/10 px-4 py-2 text-xs font-semibold text-flex-accent2 transition hover:bg-flex-accent2/20 disabled:opacity-50"
      >
        {busy ? "Création…" : "↻ Remixer ce film"}
      </button>
      {error && (
        <span className="text-xs text-red-400">⚠ {error}</span>
      )}
    </div>
  );
}
