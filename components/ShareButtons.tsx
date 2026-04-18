"use client";

import { useState } from "react";

/**
 * Minimal social sharing. "Copier le lien" + Twitter/X open. No SDK,
 * no tracking pixel, no privacy concern — just plain URL construction.
 */
export default function ShareButtons({
  title,
  path,
}: {
  title: string;
  path: string;
}) {
  const [copied, setCopied] = useState(false);

  function getFullUrl() {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${path}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(getFullUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      const el = document.createElement("textarea");
      el.value = getFullUrl();
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function open(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function shareOnX() {
    const url = getFullUrl();
    const text = `${title} — un film créé par IA sur AIflex`;
    open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
    );
  }

  function shareOnFacebook() {
    open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getFullUrl())}`
    );
  }

  function shareOnWhatsApp() {
    const text = `${title} — ${getFullUrl()}`;
    open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`);
  }

  function shareOnReddit() {
    const url = getFullUrl();
    open(
      `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`
    );
  }

  function nativeShareIfAvailable() {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator
        .share({ title, text: title, url: getFullUrl() })
        .catch(() => {});
    } else {
      copyLink();
    }
  }

  // Embed iframe snippet — relies on the public /embed/[id] route. We
  // derive the embed id from the path: /watch/<id> → <id>.
  const embedId = path.replace(/^\/watch\//, "").split(/[?#]/)[0];
  const embedSnippet = `<iframe src="${getFullUrl().replace(`/watch/${embedId}`, `/embed/${embedId}`)}" width="640" height="360" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copyLink}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-semibold transition ${
          copied
            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
            : "border-flex-border bg-flex-panel text-flex-muted hover:border-flex-accent hover:text-flex-text"
        }`}
        aria-label="Copier le lien"
      >
        {copied ? "✓ Copié" : "🔗 Copier"}
      </button>
      <button
        type="button"
        onClick={shareOnX}
        className="rounded-lg border border-flex-border bg-flex-panel px-3 py-1.5 text-[10px] font-semibold text-flex-muted transition hover:border-flex-accent hover:text-flex-text"
        aria-label="Partager sur X"
      >
        𝕏
      </button>
      <button
        type="button"
        onClick={shareOnFacebook}
        className="rounded-lg border border-flex-border bg-flex-panel px-3 py-1.5 text-[10px] font-semibold text-flex-muted transition hover:border-flex-accent hover:text-flex-text"
        aria-label="Partager sur Facebook"
      >
        f
      </button>
      <button
        type="button"
        onClick={shareOnWhatsApp}
        className="rounded-lg border border-flex-border bg-flex-panel px-3 py-1.5 text-[10px] font-semibold text-flex-muted transition hover:border-flex-accent hover:text-flex-text"
        aria-label="Partager sur WhatsApp"
      >
        WA
      </button>
      <button
        type="button"
        onClick={shareOnReddit}
        className="rounded-lg border border-flex-border bg-flex-panel px-3 py-1.5 text-[10px] font-semibold text-flex-muted transition hover:border-flex-accent hover:text-flex-text"
        aria-label="Partager sur Reddit"
      >
        r
      </button>
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(embedSnippet)}
        className="rounded-lg border border-flex-border bg-flex-panel px-3 py-1.5 text-[10px] font-semibold text-flex-muted transition hover:border-flex-accent hover:text-flex-text"
        aria-label="Copier le code d'embed"
        title="Copier le code <iframe>"
      >
        &lt;/&gt;
      </button>
      <button
        type="button"
        onClick={nativeShareIfAvailable}
        className="rounded-lg border border-flex-border bg-flex-panel px-3 py-1.5 text-[10px] font-semibold text-flex-muted transition hover:border-flex-accent hover:text-flex-text sm:hidden"
        aria-label="Partage natif"
      >
        ↗ Plus
      </button>
    </div>
  );
}
