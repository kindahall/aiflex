"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface StatusResponse {
  status: string;
  progress: number;
  errorMessage?: string | null;
  projectId?: string | null;
  scheduledAt?: string | null;
  launchAt?: string | null;
  updatedAt: string;
}

interface Props {
  jobId: string;
  /** Called once status becomes "done" with the resulting projectId */
  onComplete?: (projectId: string) => void;
  /** Polling cadence (ms). Default: 10000 for non-realtime pages */
  intervalMs?: number;
  /** Auto-redirect to /watch/<projectId> when done. Default: false */
  autoRedirect?: boolean;
  /** Compact inline card vs full-page center layout */
  variant?: "full" | "inline";
}

/**
 * Reusable progress card for a GenerationJob (V7 §17 #22).
 * Lives outside /agent/validate so it can be embedded in dashboards,
 * notifications, and the studio create flow.
 */
export default function GenerationProgress({
  jobId,
  onComplete,
  intervalMs = 10_000,
  autoRedirect = false,
  variant = "inline",
}: Props) {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      try {
        const res = await fetch(`/api/agent/status/${jobId}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Job inaccessible");
        const json = (await res.json()) as StatusResponse;
        if (cancelled) return;
        setData(json);
        if (json.status === "done" && json.projectId) {
          if (timer) clearInterval(timer);
          onComplete?.(json.projectId);
          if (autoRedirect && typeof window !== "undefined") {
            window.location.href = `/watch/${json.projectId}`;
          }
        }
        if (json.status === "error" && timer) {
          clearInterval(timer);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur");
      }
    }

    poll();
    timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [jobId, intervalMs, autoRedirect, onComplete]);

  if (error) {
    return (
      <Box variant={variant}>
        <Icon>⚠️</Icon>
        <h3 className="font-display text-lg font-semibold">Impossible de suivre le job</h3>
        <p className="mt-1 text-sm text-flex-muted">{error}</p>
      </Box>
    );
  }
  if (!data) {
    return (
      <Box variant={variant}>
        <div className="h-6 w-24 animate-pulse rounded bg-flex-card" />
      </Box>
    );
  }

  const pct = Math.round(data.progress * 100);
  const isDone = data.status === "done";
  const isError = data.status === "error";

  return (
    <Box variant={variant}>
      <Icon>{isError ? "⚠️" : isDone ? "🎬" : "⚙️"}</Icon>
      <h3 className="font-display text-lg font-semibold">{statusLabel(data.status)}</h3>

      {!isDone && !isError && (
        <>
          <div className="mt-4 h-2 w-full max-w-md overflow-hidden rounded-full bg-flex-card">
            <div
              className="h-full bg-gradient-to-r from-flex-accent to-flex-accent2 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-flex-muted">{pct}%</div>
          {data.launchAt && data.status === "scheduled" && (
            <p className="mt-2 text-xs text-flex-muted">
              Lancement prévu :{" "}
              {new Intl.DateTimeFormat("fr-FR", {
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(data.launchAt))}
            </p>
          )}
        </>
      )}

      {isError && (
        <p className="mt-2 text-sm text-red-400">{data.errorMessage || "Erreur inconnue."}</p>
      )}

      {isDone && data.projectId && !autoRedirect && (
        <Link
          href={`/watch/${data.projectId}`}
          className="mt-4 inline-block rounded-full bg-flex-accent px-5 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          Voir le film
        </Link>
      )}
    </Box>
  );
}

function Box({
  variant,
  children,
}: {
  variant: "full" | "inline";
  children: React.ReactNode;
}) {
  if (variant === "full") {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-flex-border bg-flex-panel p-10 text-center shadow-cinema">
        {children}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-flex-border bg-flex-panel p-5">
      {children}
    </div>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-flex-accent/10 text-2xl">
      {children}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "En attente…";
    case "scheduled":
      return "Programmé";
    case "analyzing":
      return "Analyse de ton idée…";
    case "scenario_ready":
      return "Préparation de la génération…";
    case "awaiting_validation":
      return "Validation requise";
    case "generating":
      return "Génération des scènes…";
    case "done":
      return "🎬 Film prêt !";
    case "error":
      return "Erreur";
    default:
      return status;
  }
}
