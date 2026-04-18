"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  jobId: string;
}

export default function SequelApprovalActions({ jobId }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject" && !reason.trim()) {
      setShowReason(true);
      return;
    }
    setPending(decision);
    setError(null);
    try {
      const res = await fetch(`/api/sequel-approvals/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          reason: decision === "reject" ? reason.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {showReason && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Raison du refus (visible par le créateur de la suite)"
          rows={2}
          maxLength={400}
          className="w-full resize-none rounded-xl border border-flex-border bg-flex-surface px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
        />
      )}
      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => decide("approve")}
          disabled={pending !== null}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {pending === "approve" ? "…" : "✓ Approuver"}
        </button>
        <button
          onClick={() => decide("reject")}
          disabled={pending !== null}
          className="rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
        >
          {pending === "reject" ? "…" : "✕ Refuser"}
        </button>
      </div>
    </div>
  );
}
