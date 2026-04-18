"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface JobState {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

interface JobProgressProps {
  jobId: string;
  onComplete?: (result: unknown) => void;
  onFailed?: (error: string) => void;
  /** Poll interval in ms (default: 3000) */
  pollInterval?: number;
  /** Custom label shown above the bar */
  label?: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente...",
  running: "En cours...",
  completed: "Terminé",
  failed: "Échec",
};

export default function JobProgress({
  jobId,
  onComplete,
  onFailed,
  pollInterval = 3000,
  label,
}: JobProgressProps) {
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Erreur ${res.status}`);
        return;
      }
      const data = (await res.json()) as JobState;
      setJob(data);

      if (data.status === "completed" && !completedRef.current) {
        completedRef.current = true;
        onComplete?.(data.result);
      }
      if (data.status === "failed" && !completedRef.current) {
        completedRef.current = true;
        onFailed?.(data.error || "Erreur inconnue");
      }

      // Stop polling on terminal states
      if (data.status === "completed" || data.status === "failed") {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    } catch {
      setError("Impossible de contacter le serveur");
    }
  }, [jobId, onComplete, onFailed]);

  useEffect(() => {
    completedRef.current = false;
    // Initial fetch
    void poll();

    timerRef.current = setInterval(poll, pollInterval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [jobId, pollInterval, poll]);

  // Estimate time remaining
  const elapsed =
    job?.startedAt && job.status === "running"
      ? (Date.now() - job.startedAt) / 1000
      : 0;
  const pct = job?.progress ?? 0;
  const eta =
    pct > 5 && elapsed > 0
      ? Math.round((elapsed / pct) * (100 - pct))
      : null;

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (!job) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/50">
        Chargement...
      </div>
    );
  }

  const isTerminal = job.status === "completed" || job.status === "failed";

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
      {label && (
        <div className="text-xs font-medium text-white/70">{label}</div>
      )}

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            job.status === "failed"
              ? "bg-red-500"
              : job.status === "completed"
                ? "bg-green-500"
                : "bg-blue-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Status line */}
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>
          {STATUS_LABELS[job.status] || job.status}
          {job.status === "running" && ` (${pct}%)`}
        </span>
        {eta !== null && !isTerminal && (
          <span>~{eta}s restant{eta !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Error message */}
      {job.status === "failed" && job.error && (
        <div className="text-xs text-red-400 mt-1">{job.error}</div>
      )}
    </div>
  );
}
