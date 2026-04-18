"use client";

import { useEffect, useState } from "react";

interface CollaboratorItem {
  id: string;
  userId: string;
  role: "viewer" | "editor";
  invitedBy: string;
  createdAt: number;
}

export default function CollaboratorPanel({
  projectId,
  isOwner,
}: {
  projectId: string;
  isOwner: boolean;
}) {
  const [collaborators, setCollaborators] = useState<CollaboratorItem[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/collaborators?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setCollaborators(d.collaborators || []));
  }, [projectId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/collaborators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, email: email.trim(), role }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setCollaborators((prev) => [...prev, data.collaborator]);
        setEmail("");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(userId: string) {
    await fetch("/api/collaborators", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, userId }),
    });
    setCollaborators((prev) => prev.filter((c) => c.userId !== userId));
  }

  return (
    <div className="rounded-2xl border border-flex-border bg-flex-card p-5">
      <h3 className="font-bold text-flex-text mb-4">Collaborateurs</h3>

      {collaborators.length === 0 ? (
        <p className="text-sm text-flex-muted mb-4">
          Aucun collaborateur. Invite quelqu&apos;un !
        </p>
      ) : (
        <ul className="space-y-2 mb-4">
          {collaborators.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-xl bg-flex-surface px-4 py-2.5"
            >
              <div>
                <span className="text-sm font-medium text-flex-text">
                  {c.userId}
                </span>
                <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-flex-accent bg-flex-accent/10 px-2 py-0.5 rounded-full">
                  {c.role}
                </span>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => handleRemove(c.userId)}
                  className="text-xs text-flex-muted hover:text-red-500 transition"
                >
                  Retirer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOwner && (
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email du collaborateur"
              className="flex-1 rounded-xl bg-flex-surface px-4 py-2.5 text-sm text-flex-text placeholder:text-flex-muted focus:outline-none focus:ring-2 focus:ring-flex-accent"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
              className="rounded-xl bg-flex-surface px-3 py-2.5 text-sm text-flex-text focus:outline-none focus:ring-2 focus:ring-flex-accent"
            >
              <option value="viewer">Lecteur</option>
              <option value="editor">Éditeur</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full rounded-full bg-flex-accent py-2.5 text-sm font-bold text-white transition hover:bg-flex-accent/90 disabled:opacity-50"
          >
            {loading ? "Invitation..." : "Inviter"}
          </button>
          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}
        </form>
      )}
    </div>
  );
}
