"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useToast } from "@/components/Toast";

export default function FollowButton({ userId }: { userId: string }) {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/users/${userId}/follow`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setFollowing(Boolean(d.following));
        setFollowers(d.followers || 0);
      })
      .catch(() => {});
  }, [userId]);

  async function toggle() {
    if (!user || busy) return;
    setBusy(true);
    const was = following;
    setFollowing(!was);
    setFollowers((c) => c + (was ? -1 : 1));
    try {
      const res = await fetch(`/api/users/${userId}/follow`, {
        method: was ? "DELETE" : "POST",
      });
      const d = await res.json();
      if (!res.ok) {
        setFollowing(was);
        setFollowers((c) => c + (was ? 1 : -1));
        toast("error", d.error || "Erreur");
        return;
      }
      setFollowing(d.following);
      setFollowers(d.followers);
      toast("success", d.following ? "Abonné !" : "Désabonné");
    } catch {
      setFollowing(was);
      setFollowers((c) => c + (was ? 1 : -1));
      toast("error", "Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  // Don't show follow button on your own profile
  if (user?.id === userId) return null;

  if (!loading && !user) {
    return (
      <Link
        href={`/login?next=/u/${userId}`}
        className="rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-muted transition hover:border-flex-accent hover:text-flex-text"
      >
        Connecte-toi pour suivre · {followers}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || loading}
      className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition disabled:opacity-50 ${
        following
          ? "border-flex-accent bg-flex-accent/10 text-flex-accent"
          : "border-flex-border bg-flex-panel text-flex-text hover:border-flex-accent"
      }`}
    >
      {following ? "✓ Abonné" : "+ Suivre"}
      <span className="text-flex-muted">· {followers}</span>
    </button>
  );
}
