"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useToast } from "@/components/Toast";
import { useCooldown } from "@/lib/useCooldown";
import type { Comment } from "@/lib/types";

const MAX_BODY = 600;

/**
 * Threaded comments under a public film. Anonymous users see the list
 * but get a "log in to comment" prompt. Logged-in users can post and
 * delete their own comments. The film owner and any admin can delete
 * any comment in the thread. Supports one level of nested replies.
 */
export default function CommentsSection({
  projectId,
  filmOwnerId,
}: {
  projectId: string;
  filmOwnerId: string;
}) {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postCool, coolPost] = useCooldown(1000);

  // Track which comments have their reply form open and replies expanded.
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
    new Set()
  );
  const [repliesCache, setRepliesCache] = useState<Record<string, Comment[]>>(
    {}
  );
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set());

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setComments(data.comments);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setComments([]);
    }
  }, [projectId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const fetchReplies = useCallback(
    async (commentId: string) => {
      setLoadingReplies((prev) => new Set(prev).add(commentId));
      try {
        const res = await fetch(
          `/api/projects/${projectId}/comments?parentId=${commentId}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur");
        setRepliesCache((prev) => ({
          ...prev,
          [commentId]: data.comments,
        }));
      } catch {
        // Silently fail — replies just won't show.
      } finally {
        setLoadingReplies((prev) => {
          const next = new Set(prev);
          next.delete(commentId);
          return next;
        });
      }
    },
    [projectId]
  );

  function toggleReplies(commentId: string) {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
        // Fetch replies if not cached.
        if (!repliesCache[commentId]) {
          fetchReplies(commentId);
        }
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || busy || postCool) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setBody("");
      setComments((prev) =>
        prev ? [data.comment as Comment, ...prev] : [data.comment]
      );
      toast("success", "Commentaire publie");
      coolPost();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setError(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(parentId: string) {
    const replyBody = (replyBodies[parentId] || "").trim();
    if (!replyBody || busy || postCool) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: replyBody, parentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      // Clear reply form.
      setReplyBodies((prev) => ({ ...prev, [parentId]: "" }));
      setReplyingTo(null);
      // Update parent's replyCount in local state.
      setComments(
        (prev) =>
          prev?.map((c) =>
            c.id === parentId
              ? { ...c, replyCount: (c.replyCount || 0) + 1 }
              : c
          ) || null
      );
      // Add reply to cache and expand.
      setRepliesCache((prev) => ({
        ...prev,
        [parentId]: [...(prev[parentId] || []), data.comment as Comment],
      }));
      setExpandedReplies((prev) => new Set(prev).add(parentId));
      toast("success", "Reponse publiee");
      coolPost();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setError(msg);
      toast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: string, parentId?: string) {
    if (!confirm("Supprimer ce commentaire ?")) return;
    try {
      const res = await fetch(
        `/api/projects/${projectId}/comments/${commentId}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur");

      if (parentId) {
        // Removing a reply: update cache and parent's replyCount.
        setRepliesCache((prev) => ({
          ...prev,
          [parentId]: (prev[parentId] || []).filter(
            (c) => c.id !== commentId
          ),
        }));
        setComments(
          (prev) =>
            prev?.map((c) =>
              c.id === parentId
                ? { ...c, replyCount: Math.max(0, (c.replyCount || 0) - 1) }
                : c
            ) || null
        );
      } else {
        // Removing a top-level comment.
        setComments(
          (prev) => prev?.filter((c) => c.id !== commentId) || null
        );
        // Clean up replies cache.
        setRepliesCache((prev) => {
          const next = { ...prev };
          delete next[commentId];
          return next;
        });
      }
      toast("success", "Commentaire supprime");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setError(msg);
      toast("error", msg);
    }
  }

  const canModerate =
    user && (user.id === filmOwnerId || user.role === "admin");

  return (
    <section className="mt-12">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-2xl font-black">
          Commentaires
          {comments && (
            <span className="ml-2 text-base font-semibold text-flex-muted">
              ({comments.length})
            </span>
          )}
        </h2>
      </div>

      {/* Compose */}
      {!loading && !user && (
        <div className="mb-6 rounded-2xl border border-flex-border bg-flex-card p-5">
          <p className="mb-3 text-sm text-flex-muted">
            Connecte-toi pour laisser un commentaire.
          </p>
          <Link
            href={`/login?next=/watch/${projectId}`}
            className="inline-block rounded-lg bg-flex-text px-4 py-2 text-xs font-bold text-flex-bg transition hover:opacity-90"
          >
            Se connecter
          </Link>
        </div>
      )}

      {user && (
        <form
          onSubmit={submit}
          className="mb-8 rounded-2xl border border-flex-border bg-flex-card p-5"
        >
          <label htmlFor="comment-body" className="!mb-2">
            Ton commentaire
          </label>
          <textarea
            id="comment-body"
            rows={3}
            maxLength={MAX_BODY}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Partage ton avis sur ce film..."
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[10px] text-flex-muted">
              {body.length} / {MAX_BODY}
            </span>
            <button
              type="submit"
              disabled={busy || !body.trim() || postCool}
              className="rounded-lg bg-flex-accent px-5 py-2 text-xs font-bold uppercase tracking-widest text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Envoi..." : "Publier"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* List */}
      {comments === null ? (
        <div className="text-sm text-flex-muted">Chargement...</div>
      ) : comments.length === 0 ? (
        <div className="rounded-2xl border border-flex-border bg-flex-card p-8 text-center text-sm text-flex-muted">
          Aucun commentaire pour l&apos;instant. Sois le premier a
          reagir.
        </div>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => {
            const canDelete =
              user && (user.id === c.authorId || canModerate);
            const isExpanded = expandedReplies.has(c.id);
            const isReplying = replyingTo === c.id;
            const replies = repliesCache[c.id] || [];
            const isLoadingReplies = loadingReplies.has(c.id);
            const replyCount = c.replyCount || 0;

            return (
              <li key={c.id}>
                {/* Top-level comment */}
                <div className="rounded-2xl border border-flex-border bg-flex-card p-5">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <Link
                      href={`/u/${c.authorId}`}
                      className="flex items-center gap-3 group"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-flex-accent text-sm font-black text-white">
                        {c.authorName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-bold transition group-hover:text-flex-accent">
                          {c.authorName}
                        </div>
                        <div className="text-[10px] text-flex-muted">
                          {formatRelative(c.createdAt)}
                        </div>
                      </div>
                    </Link>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        className="rounded-lg border border-flex-border bg-flex-panel px-2 py-1 text-[10px] font-semibold text-flex-muted transition hover:border-red-500/50 hover:text-red-400"
                        aria-label="Supprimer le commentaire"
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-flex-text/90">
                    {c.body}
                  </p>

                  {/* Reply actions */}
                  <div className="mt-3 flex items-center gap-4">
                    {user && (
                      <button
                        type="button"
                        onClick={() =>
                          setReplyingTo(isReplying ? null : c.id)
                        }
                        className="text-xs font-semibold text-flex-muted transition hover:text-flex-accent"
                      >
                        Repondre
                      </button>
                    )}
                    {replyCount > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleReplies(c.id)}
                        className="text-xs font-semibold text-flex-accent transition hover:text-flex-accent/80"
                      >
                        {isExpanded
                          ? "Masquer les reponses"
                          : `${replyCount} reponse${replyCount > 1 ? "s" : ""}`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline reply form */}
                {isReplying && user && (
                  <div className="ml-8 mt-2 border-l-2 border-flex-border pl-4">
                    <div className="rounded-xl border border-flex-border bg-flex-card p-4">
                      <textarea
                        rows={2}
                        maxLength={MAX_BODY}
                        value={replyBodies[c.id] || ""}
                        onChange={(e) =>
                          setReplyBodies((prev) => ({
                            ...prev,
                            [c.id]: e.target.value,
                          }))
                        }
                        placeholder={`Repondre a ${c.authorName}...`}
                        className="w-full resize-none rounded-lg border border-flex-border bg-flex-panel px-3 py-2 text-sm text-flex-text placeholder:text-flex-muted focus:border-flex-accent focus:outline-none"
                      />
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setReplyingTo(null)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-flex-muted transition hover:text-flex-text"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => submitReply(c.id)}
                          disabled={
                            busy ||
                            !(replyBodies[c.id] || "").trim() ||
                            postCool
                          }
                          className="rounded-lg bg-flex-accent px-4 py-1.5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                        >
                          {busy ? "Envoi..." : "Repondre"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Replies thread */}
                {isExpanded && (
                  <div className="ml-8 mt-2 space-y-2 border-l-2 border-flex-border pl-4">
                    {isLoadingReplies && (
                      <div className="py-2 text-xs text-flex-muted">
                        Chargement des reponses...
                      </div>
                    )}
                    {replies.map((r) => {
                      const canDeleteReply =
                        user &&
                        (user.id === r.authorId || canModerate);
                      return (
                        <div
                          key={r.id}
                          className="rounded-xl border border-flex-border bg-flex-card/60 p-4"
                        >
                          <div className="mb-1 flex items-start justify-between gap-3">
                            <Link
                              href={`/u/${r.authorId}`}
                              className="flex items-center gap-2 group"
                            >
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-flex-accent/80 text-[10px] font-black text-white">
                                {r.authorName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="text-xs font-bold transition group-hover:text-flex-accent">
                                  {r.authorName}
                                </span>
                                <span className="ml-2 text-[10px] text-flex-muted">
                                  {formatRelative(r.createdAt)}
                                </span>
                              </div>
                            </Link>
                            {canDeleteReply && (
                              <button
                                type="button"
                                onClick={() => remove(r.id, c.id)}
                                className="rounded-lg border border-flex-border bg-flex-panel px-2 py-0.5 text-[10px] font-semibold text-flex-muted transition hover:border-red-500/50 hover:text-red-400"
                                aria-label="Supprimer la reponse"
                              >
                                Supprimer
                              </button>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap text-xs leading-relaxed text-flex-text/90">
                            {r.body}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "a l'instant";
  if (diff < hour) return `il y a ${Math.floor(diff / min)} min`;
  if (diff < day) return `il y a ${Math.floor(diff / hour)} h`;
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`;
  return new Date(ts).toLocaleDateString("fr-FR");
}
