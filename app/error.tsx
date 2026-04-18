"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Per-route error boundary. Catches anything thrown during rendering of a
 * route segment and below. The `reset()` callback re-runs the segment so
 * the user can retry without a hard reload.
 *
 * In production this is where Sentry capture would go (1.7 follow-up).
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[route error]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <div className="mb-3 text-5xl">⚠</div>
      <h1 className="mb-3 text-3xl font-black">
        Une erreur inattendue est survenue
      </h1>
      <p className="mb-6 text-sm text-flex-muted">
        On regarde ce qu&apos;il se passe. En attendant, tu peux essayer
        de relancer la page ou revenir à l&apos;accueil.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-flex-accent px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
        >
          Réessayer
        </button>
        <Link
          href="/"
          className="rounded-lg border border-flex-border bg-flex-panel px-5 py-2.5 text-sm font-semibold text-flex-text transition hover:border-flex-accent"
        >
          Retour à l&apos;accueil
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
