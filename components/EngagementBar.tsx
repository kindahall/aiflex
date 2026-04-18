"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useToast } from "@/components/Toast";
import { useCooldown } from "@/lib/useCooldown";

export default function EngagementBar({
  projectId,
  initialLikes,
}: {
  projectId: string;
  initialLikes: number;
}) {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(initialLikes);
  const [saved, setSaved] = useState(false);
  const [busyLike, setBusyLike] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [likeCool, coolLike] = useCooldown(500);
  const [saveCool, coolSave] = useCooldown(500);

  useEffect(() => {
    if (loading) return;
    fetch(`/api/projects/${projectId}/like`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.count === "number") setCount(d.count);
        if (typeof d.liked === "boolean") setLiked(d.liked);
      })
      .catch(() => toast("error", "Erreur de chargement des likes"));
    if (!user) {
      setSaved(false);
      return;
    }
    fetch(`/api/projects/${projectId}/watchlist`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSaved(Boolean(d.saved)))
      .catch(() => toast("error", "Erreur de chargement watchlist"));
  }, [user, loading, projectId, toast]);

  async function toggleLike() {
    if (!user || busyLike || likeCool) return;
    setBusyLike(true);
    const wasLiked = liked;
    setLiked(!wasLiked);
    setCount((c) => Math.max(0, c + (wasLiked ? -1 : 1)));
    try {
      const res = await fetch(`/api/projects/${projectId}/like`, {
        method: wasLiked ? "DELETE" : "POST",
      });
      const d = await res.json();
      if (!res.ok) {
        setLiked(wasLiked);
        setCount((c) => Math.max(0, c + (wasLiked ? 1 : -1)));
        toast("error", "Impossible de liker");
        return;
      }
      if (typeof d.liked === "boolean") setLiked(d.liked);
      if (typeof d.count === "number") setCount(d.count);
    } catch {
      setLiked(wasLiked);
      setCount((c) => Math.max(0, c + (wasLiked ? 1 : -1)));
      toast("error", "Erreur réseau");
    } finally {
      setBusyLike(false);
      coolLike();
    }
  }

  async function toggleSave() {
    if (!user || busySave || saveCool) return;
    setBusySave(true);
    const wasSaved = saved;
    setSaved(!wasSaved);
    try {
      const res = await fetch(`/api/projects/${projectId}/watchlist`, {
        method: wasSaved ? "DELETE" : "POST",
      });
      if (!res.ok) {
        setSaved(wasSaved);
        toast("error", "Erreur watchlist");
        return;
      }
      toast("success", wasSaved ? "Retiré de ta liste" : "Ajouté à ta liste");
    } catch {
      setSaved(wasSaved);
      toast("error", "Erreur réseau");
    } finally {
      setBusySave(false);
      coolSave();
    }
  }

  if (!loading && !user) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/login?next=/watch/${projectId}`}
          className="flex items-center gap-2 rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-muted transition hover:border-flex-accent hover:text-flex-text"
        >
          <span>♡</span>
          <span>{count}</span>
          <span className="hidden sm:inline">— connecte-toi pour aimer</span>
        </Link>
        <Link
          href={`/login?next=/watch/${projectId}`}
          className="flex items-center gap-2 rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-muted transition hover:border-flex-accent2 hover:text-flex-text"
        >
          + Ajouter à ma liste
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={toggleLike}
        disabled={busyLike || loading || likeCool}
        aria-pressed={liked}
        className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition disabled:opacity-50 ${
          liked
            ? "border-flex-accent bg-flex-accent/10 text-flex-accent"
            : "border-flex-border bg-flex-panel text-flex-text hover:border-flex-accent"
        }`}
      >
        <span>{liked ? "♥" : "♡"}</span>
        <span>{count}</span>
      </button>
      <button
        type="button"
        onClick={toggleSave}
        disabled={busySave || loading || saveCool}
        aria-pressed={saved}
        className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition disabled:opacity-50 ${
          saved
            ? "border-flex-accent2 bg-flex-accent2/10 text-flex-accent2"
            : "border-flex-border bg-flex-panel text-flex-text hover:border-flex-accent2"
        }`}
      >
        {saved ? "✓ Dans ma liste" : "+ Ma liste"}
      </button>
    </div>
  );
}
