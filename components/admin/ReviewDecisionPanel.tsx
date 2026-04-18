"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/components/ui";

interface Props {
  filmId: string;
  defaultCreditAmount: number; // in cents
}

export default function ReviewDecisionPanel({ filmId, defaultCreditAmount }: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);

  async function submit(decision: "approve" | "reject") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/review/${filmId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      router.push("/admin/reviews");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-flex-muted" htmlFor="review-note">
          Note au créateur (optionnel, obligatoire en cas de refus)
        </label>
        <textarea
          id="review-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Ex: contenu ne respectant pas la règle X…"
          className="w-full resize-none rounded-xl border border-flex-border bg-flex-surface px-3 py-2 text-sm focus:border-flex-accent focus:outline-none"
          maxLength={500}
        />
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          fullWidth
          onClick={() => setPending("approve")}
          disabled={submitting}
          className="!bg-emerald-600 !from-emerald-600 !to-emerald-700"
        >
          ✓ Approuver — publier
        </Button>
        <Button
          variant="danger"
          fullWidth
          onClick={() => {
            if (!note.trim()) {
              setError("Merci d'expliquer au créateur la raison du refus.");
              return;
            }
            setPending("reject");
          }}
          disabled={submitting}
        >
          ✕ Rejeter — avoir ${(defaultCreditAmount / 100).toFixed(2)}
        </Button>
      </div>

      <p className="text-xs text-flex-muted">
        En cas de refus, un avoir du montant payé est automatiquement crédité sur le
        compte du créateur. Pas de remboursement bancaire direct.
      </p>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (pending) await submit(pending);
        }}
        title={
          pending === "approve" ? "Approuver cette suite ?" : "Rejeter cette suite ?"
        }
        description={
          pending === "approve"
            ? "La suite sera publiée immédiatement et visible par tous."
            : `Un avoir de $${(defaultCreditAmount / 100).toFixed(2)} sera crédité au créateur. Action irréversible.`
        }
        confirmLabel={pending === "approve" ? "Approuver" : "Rejeter"}
        variant={pending === "approve" ? "primary" : "danger"}
      />
    </div>
  );
}
