"use client";

import { useState } from "react";

const TIP_AMOUNTS = [
  { value: 100, label: "1$" },
  { value: 300, label: "3$" },
  { value: 500, label: "5$" },
  { value: 1000, label: "10$" },
];

export default function TipButton({
  creatorId,
  creatorName,
  projectId,
}: {
  creatorId: string;
  creatorName: string;
  /** Optional film context — the receiver sees which film triggered the tip. */
  projectId?: string;
}) {
  const [showModal, setShowModal] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(300);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * V8 §21.1 — tips go through Stripe Checkout rather than a direct DB
   * write. We hit /api/tips/checkout which returns a Stripe-hosted URL we
   * redirect to. Activation happens server-side via the Stripe webhook
   * (lib/stripe-oneshot → activateTip).
   */
  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/tips/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: creatorId,
          amountCents: selectedAmount,
          message: message.trim() || undefined,
          projectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:shadow-xl hover:brightness-110"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        Envoyer un tip
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-flex-card border border-flex-border p-6 shadow-2xl">
            {sent ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-4">🎉</div>
                <h3 className="text-lg font-bold text-flex-text">Merci !</h3>
                <p className="text-sm text-flex-muted mt-2">
                  Ton tip a été envoyé à {creatorName}
                </p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-flex-text mb-1">
                  Soutenir {creatorName}
                </h3>
                <p className="text-sm text-flex-muted mb-5">
                  Envoie un tip pour encourager ce créateur
                </p>

                <div className="grid grid-cols-4 gap-2 mb-5">
                  {TIP_AMOUNTS.map((tip) => (
                    <button
                      key={tip.value}
                      type="button"
                      onClick={() => setSelectedAmount(tip.value)}
                      className={`rounded-xl py-2.5 text-sm font-bold transition ${
                        selectedAmount === tip.value
                          ? "bg-flex-accent text-white"
                          : "bg-flex-surface text-flex-text hover:bg-flex-border"
                      }`}
                    >
                      {tip.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ajouter un message (optionnel)"
                  className="w-full rounded-xl bg-flex-surface px-4 py-3 text-sm text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent resize-none mb-5"
                  rows={2}
                  maxLength={280}
                />

                {error && (
                  <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    {error}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending}
                    className="flex-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    {sending ? "Redirection…" : `Payer ${(selectedAmount / 100).toFixed(2)}$`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="rounded-full bg-flex-surface px-5 py-2.5 text-sm font-medium text-flex-text transition hover:bg-flex-border"
                  >
                    Annuler
                  </button>
                </div>
                <p className="mt-3 text-center text-[10px] text-flex-muted">
                  90 % au créateur · 10 % AIflex
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
