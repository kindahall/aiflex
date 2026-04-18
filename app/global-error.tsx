"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary. Catches errors thrown in the root layout
 * itself (where the per-route error.tsx can't render). MUST include its
 * own <html> and <body> tags because the layout is what failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[global error]", error);

    // Report to Sentry via a lightweight POST to our own API route,
    // since the Sentry lib is server-only.
    fetch("/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: error.name,
        message: error.message,
        stack: error.stack,
        digest: error.digest,
      }),
    }).catch(() => {
      // Fire-and-forget — ignore network failures.
    });
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#08080c",
          color: "#f5f5f7",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠</div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              marginBottom: 12,
            }}
          >
            AIflex n&apos;a pas pu démarrer
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#8a8a97",
              lineHeight: 1.6,
              marginBottom: 24,
            }}
          >
            Une erreur critique est survenue dans le shell de
            l&apos;application. Réessaie ; si le problème persiste, vide le
            cache de ton navigateur.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#f97316",
              color: "white",
              border: 0,
              padding: "12px 24px",
              borderRadius: 12,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
          {error?.digest && (
            <div
              style={{
                marginTop: 24,
                fontFamily: "monospace",
                fontSize: 10,
                color: "#71717a",
              }}
            >
              ref: {error.digest}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
