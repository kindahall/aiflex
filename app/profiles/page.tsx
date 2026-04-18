"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ProfileItem {
  id: string;
  name: string;
  avatarSeed?: string;
  isChild: boolean;
  maxRating: string;
}

export default function ProfilesPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [isChild, setIsChild] = useState(false);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((d) => {
        setProfiles(d.profiles || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    const res = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        isChild,
        maxRating: isChild ? "PG" : "R",
      }),
    });
    const data = await res.json();
    if (data.profile) {
      setProfiles((prev) => [...prev, data.profile]);
      setNewName("");
      setIsChild(false);
      setShowCreate(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/profiles/${id}`, { method: "DELETE" });
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }

  function selectProfile(profile: ProfileItem) {
    // Store selected profile in session storage for the current session
    sessionStorage.setItem("aiflex_profile", JSON.stringify(profile));
    router.push("/");
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-flex-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
      <h1 className="font-display text-4xl font-bold text-flex-text mb-2">
        Qui regarde ?
      </h1>
      <p className="text-flex-muted mb-10">Choisis ton profil</p>

      <div className="flex flex-wrap justify-center gap-6 mb-10">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => selectProfile(profile)}
            className="group flex flex-col items-center gap-3"
          >
            <div className="h-24 w-24 rounded-2xl bg-flex-accent/20 flex items-center justify-center text-3xl font-bold text-flex-accent transition group-hover:ring-4 group-hover:ring-flex-accent">
              {profile.name[0]?.toUpperCase()}
            </div>
            <span className="text-sm font-medium text-flex-text group-hover:text-flex-accent transition">
              {profile.name}
            </span>
            {profile.isChild && (
              <span className="text-[10px] font-bold uppercase tracking-widest text-flex-accent bg-flex-accent/10 px-2 py-0.5 rounded-full">
                Enfant
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(profile.id);
              }}
              className="text-[10px] text-flex-muted hover:text-red-500 transition opacity-0 group-hover:opacity-100"
            >
              Supprimer
            </button>
          </button>
        ))}

        {/* Add profile button */}
        {profiles.length < 5 && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex flex-col items-center gap-3 group"
          >
            <div className="h-24 w-24 rounded-2xl border-2 border-dashed border-flex-border flex items-center justify-center text-3xl text-flex-muted transition group-hover:border-flex-accent group-hover:text-flex-accent">
              +
            </div>
            <span className="text-sm font-medium text-flex-muted group-hover:text-flex-accent transition">
              Ajouter
            </span>
          </button>
        )}
      </div>

      {/* Create profile form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="w-full max-w-sm space-y-4">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom du profil"
            className="w-full rounded-xl bg-flex-surface px-4 py-3 text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent"
            maxLength={20}
            autoFocus
          />
          <label className="flex items-center gap-3 text-sm text-flex-text">
            <input
              type="checkbox"
              checked={isChild}
              onChange={(e) => setIsChild(e.target.checked)}
              className="rounded"
            />
            Profil enfant (contenu restreint PG max)
          </label>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!newName.trim()}
              className="flex-1 rounded-full bg-flex-accent px-6 py-2.5 text-sm font-bold text-white transition hover:bg-flex-accent/90 disabled:opacity-50"
            >
              Créer
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-full bg-flex-surface px-6 py-2.5 text-sm font-medium text-flex-text transition hover:bg-flex-border"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Skip — use default profile */}
      <button
        type="button"
        onClick={() => router.push("/")}
        className="mt-6 text-sm text-flex-muted hover:text-flex-accent transition"
      >
        Continuer sans profil
      </button>
    </div>
  );
}
