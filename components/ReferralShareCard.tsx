"use client";

import { useState } from "react";

interface Props {
  shareUrl: string;
  code: string;
}

/**
 * Card with the creator's personal referral URL + quick share actions
 * (V8 §21.3). Copy-to-clipboard + native share on mobile.
 */
export default function ReferralShareCard({ shareUrl, code }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore — browsers without clipboard permission */
    }
  }

  async function nativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator
        .share({
          title: "Rejoins-moi sur AIflex",
          text: "Je crée des films IA sur AIflex — rejoins-moi avec mon lien.",
          url: shareUrl,
        })
        .catch(() => {});
    } else {
      copy();
    }
  }

  return (
    <div className="rounded-3xl border border-flex-border bg-flex-panel p-6 shadow-cinema sm:p-8">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-flex-muted">
        Ton lien personnel
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          readOnly
          value={shareUrl}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="flex-1 rounded-xl border border-flex-border bg-flex-surface px-3 py-2.5 text-sm focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="rounded-full bg-flex-card px-4 py-2 text-sm font-medium hover:bg-flex-border"
          >
            {copied ? "✓ Copié" : "Copier"}
          </button>
          <button
            onClick={nativeShare}
            className="rounded-full bg-flex-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
          >
            Partager
          </button>
        </div>
      </div>
      <div className="mt-3 text-xs text-flex-muted">
        Ton code : <code className="rounded bg-flex-card px-1.5 py-0.5">{code}</code>
      </div>
    </div>
  );
}
