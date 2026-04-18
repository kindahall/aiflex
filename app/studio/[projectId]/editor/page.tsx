"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import VideoEditor from "@/components/VideoEditor";
import LoadingPulse from "@/components/LoadingPulse";
import { getProject, patchProject } from "@/lib/client-api";
import { useAuth } from "@/lib/useAuth";
import { useToast } from "@/components/Toast";
import type { Project, Scene } from "@/lib/types";

export default function EditorPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = params?.projectId;
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounced save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user)
      router.push(`/login?next=/studio/${projectId}/editor`);
  }, [authLoading, user, router, projectId]);

  // Load project
  useEffect(() => {
    if (!projectId || !user) return;
    getProject(projectId)
      .then((p) => {
        // Verify ownership
        if (p.ownerId !== user.id) {
          setError("Vous n'avez pas acces a ce projet.");
          setTimeout(() => router.push("/dashboard"), 1200);
          return;
        }
        setProject(p);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Erreur");
        setTimeout(() => router.push("/dashboard"), 1200);
      });
  }, [projectId, user, router]);

  // Debounced save handler
  const handleScenesChange = useCallback(
    (scenes: Scene[]) => {
      if (!project) return;
      // Update local state immediately
      setProject((p) => (p ? { ...p, scenes } : p));
      // Debounce the server save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const updated = await patchProject(project.id, { scenes });
          setProject(updated);
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : "Erreur de sauvegarde";
          toast("error", msg);
        }
      }, 1500);
    },
    [project, toast]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleExport = useCallback(
    (format: "original" | "compressed") => {
      toast(
        "success",
        format === "original"
          ? "Export en qualite originale lance..."
          : "Export compresse lance..."
      );
      // In a real implementation this would trigger a server-side encoding job
    },
    [toast]
  );

  // ── Loading / error states ────────────────────────────────────────────

  if (authLoading || !user || !project) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--flex-bg)]">
        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
            {error}
          </div>
        ) : (
          <LoadingPulse label="Chargement de l'editeur" />
        )}
      </div>
    );
  }

  if (!project.scenes || project.scenes.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[var(--flex-bg)] text-[var(--flex-text)]">
        <div className="text-lg font-bold">Aucune scene dans ce projet</div>
        <p className="text-sm text-[var(--flex-muted)]">
          Retourne au studio pour generer des scenes avant d&apos;utiliser
          l&apos;editeur.
        </p>
        <Link
          href={`/studio/${projectId}`}
          className="rounded-lg bg-[var(--flex-accent)] px-6 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
        >
          Retour au studio
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Back nav */}
      <div className="flex items-center gap-3 border-b border-[var(--flex-border)] bg-[var(--flex-panel)] px-4 py-1.5">
        <Link
          href={`/studio/${projectId}`}
          className="rounded-md border border-[var(--flex-border)] bg-[var(--flex-card)] px-3 py-1 text-[11px] font-semibold text-[var(--flex-text)] transition hover:border-[var(--flex-accent)]"
        >
          ← Studio
        </Link>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--flex-accent)]">
          Editeur Video
        </span>
        <span className="text-xs text-[var(--flex-muted)]">
          {project.concept?.title ?? project.idea}
        </span>
        <div className="ml-auto text-[10px] text-[var(--flex-muted)]">
          Auto-save actif
        </div>
      </div>

      {/* Editor fills remaining space */}
      <div className="min-h-0 flex-1">
        <VideoEditor
          scenes={project.scenes}
          title={project.concept?.title ?? project.idea}
          audioTrackUrl={project.audioTrackUrl}
          onChange={handleScenesChange}
          onExport={handleExport}
        />
      </div>
    </div>
  );
}
