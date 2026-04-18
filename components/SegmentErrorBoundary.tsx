"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui";

/**
 * Reusable shell for per-segment error boundaries (app/<segment>/error.tsx).
 * Keeps the crash isolated to the segment instead of taking down the whole
 * app via the root boundary.
 */
export function SegmentErrorBoundary({
  error,
  reset,
  title = "Une erreur inattendue est survenue",
  description = "On regarde ce qu'il se passe. Tu peux relancer la page ou revenir en arrière.",
  homeHref = "/",
  homeLabel = "Retour à l'accueil",
  tag,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
  homeHref?: string;
  homeLabel?: string;
  tag?: string;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(`[error:${tag || "segment"}]`, error);
  }, [error, tag]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <div className="mb-3 text-5xl" aria-hidden="true">
        ⚠
      </div>
      <h1 className="mb-3 text-2xl font-black text-flex-text">{title}</h1>
      <p className="mb-6 text-sm text-flex-muted">{description}</p>
      <div className="flex items-center justify-center gap-3">
        <Button variant="primary" onClick={reset}>
          Réessayer
        </Button>
        <Link
          href={homeHref}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-flex-border bg-flex-panel px-4 text-sm font-semibold text-flex-text transition hover:border-flex-accent"
        >
          {homeLabel}
        </Link>
      </div>
      {error?.digest && (
        <div className="mt-6 font-mono text-[10px] text-flex-muted">
          ref: {error.digest}
        </div>
      )}
    </div>
  );
}
