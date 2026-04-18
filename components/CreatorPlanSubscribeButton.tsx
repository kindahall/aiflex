"use client";

import { useState } from "react";

interface Props {
  plan: string;
}

export default function CreatorPlanSubscribeButton({ plan }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/creator-plan/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setPending(false);
    }
  }

  return (
    <>
      <button
        onClick={go}
        disabled={pending}
        className="w-full rounded-full bg-flex-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
      >
        {pending ? "Redirection…" : "Souscrire"}
      </button>
      {error && (
        <div className="mt-2 rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-400">
          {error}
        </div>
      )}
    </>
  );
}
