"use client";

import { useEffect, useState } from "react";

interface Props {
  entryId: string;
}

/**
 * Vote button (V8 §24.5). Client-side dedup via localStorage — good
 * enough for an MVP community feature, since the prize pool is bounded
 * and the downside of a determined cheater is bounded too. Replace with
 * a `ChallengeVote` model when fraud matters.
 */
export default function ChallengeVoteButton({ entryId }: Props) {
  const [state, setState] = useState<"idle" | "voted" | "pending" | "err">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(`challenge-vote:${entryId}`) === "1") {
      setState("voted");
    }
  }, [entryId]);

  async function vote() {
    if (state !== "idle") return;
    setState("pending");
    try {
      const res = await fetch(`/api/challenges/entries/${entryId}/vote`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      localStorage.setItem(`challenge-vote:${entryId}`, "1");
      setState("voted");
    } catch {
      setState("err");
      setTimeout(() => setState("idle"), 1500);
    }
  }

  return (
    <button
      onClick={vote}
      disabled={state !== "idle"}
      className={`w-full rounded-full px-3 py-2 text-sm font-medium transition ${
        state === "voted"
          ? "bg-emerald-500/15 text-emerald-400"
          : state === "err"
            ? "bg-red-500/15 text-red-400"
            : "bg-flex-accent text-white hover:brightness-110"
      }`}
    >
      {state === "voted"
        ? "✓ Voté"
        : state === "pending"
          ? "Envoi…"
          : state === "err"
            ? "Erreur"
            : "👍 Voter"}
    </button>
  );
}
