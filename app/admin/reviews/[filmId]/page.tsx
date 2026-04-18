import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import ReviewDecisionPanel from "@/components/admin/ReviewDecisionPanel";

export const dynamic = "force-dynamic";

export default async function AdminReviewDetailPage({
  params,
}: {
  params: Promise<{ filmId: string }>;
}) {
  const { filmId } = await params;
  const user = await requireUser().catch(() => null);
  if (!user || user.role !== "admin") {
    redirect("/login?redirect=/admin/reviews");
  }

  const film = await prisma.project.findUnique({
    where: { id: filmId },
    include: {
      owner: { select: { id: true, email: true, name: true, suspended: true } },
    },
  });
  if (!film) notFound();

  const isPending = film.adminReviewStatus === "pending_review";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/admin/reviews"
        className="mb-6 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Retour à la file
      </Link>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div>
          <header className="mb-6">
            <h1 className="font-display text-3xl font-bold">
              {film.title || "Sans titre"}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-flex-card px-3 py-1 text-flex-muted">
                {film.genre || "—"}
              </span>
              <span className="rounded-full bg-flex-card px-3 py-1 text-flex-muted">
                {film.durationMinutes ? `${film.durationMinutes} min` : "—"}
              </span>
              <StatusBadge status={film.adminReviewStatus} />
            </div>
          </header>

          <div className="mb-6 overflow-hidden rounded-3xl border border-flex-border bg-flex-panel shadow-cinema">
            {film.outputUrl ? (
              <video
                controls
                src={film.outputUrl}
                poster={film.thumbnailUrl || undefined}
                className="aspect-video w-full bg-black"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center bg-flex-card text-flex-muted">
                Pas de vidéo disponible
              </div>
            )}
          </div>

          {film.synopsis && (
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider">
                Synopsis
              </h2>
              <p className="text-sm leading-relaxed text-flex-muted">
                {film.synopsis}
              </p>
            </section>
          )}

          <section className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider">
              Métadonnées techniques
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Info label="Taille">
                {film.fileSize
                  ? `${(Number(film.fileSize) / (1024 * 1024)).toFixed(1)} MB`
                  : "—"}
              </Info>
              <Info label="Fichier">{film.originalFileName || "—"}</Info>
              <Info label="Visibilité">{film.visibility}</Info>
              <Info label="Payé">
                {film.amountPaid != null ? `$${(film.amountPaid / 100).toFixed(2)}` : "—"}
              </Info>
              <Info label="Créé le">
                {new Intl.DateTimeFormat("fr-FR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(film.createdAt)}
              </Info>
              <Info label="isAdult">{film.isAdult ? "Oui" : "Non"}</Info>
            </dl>
          </section>
        </div>

        <aside>
          <div className="sticky top-6 rounded-3xl border border-flex-border bg-flex-panel p-6 shadow-cinema">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider">
              Créateur
            </h2>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-flex-accent to-flex-accent2 font-medium text-white">
                {film.owner.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{film.owner.name}</div>
                <div className="truncate text-xs text-flex-muted">
                  {film.owner.email}
                </div>
              </div>
            </div>
            {film.owner.suspended && (
              <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                Compte suspendu
              </div>
            )}

            {isPending ? (
              <div className="mt-6 border-t border-flex-border pt-6">
                <ReviewDecisionPanel
                  filmId={film.id}
                  defaultCreditAmount={film.amountPaid ?? 0}
                />
              </div>
            ) : (
              <div className="mt-6 border-t border-flex-border pt-6">
                <p className="text-sm text-flex-muted">
                  Décision :{" "}
                  <strong className="text-flex-text">
                    {film.adminReviewStatus ?? "—"}
                  </strong>
                </p>
                {film.adminReviewNote && (
                  <p className="mt-2 text-sm text-flex-muted">
                    Note : {film.adminReviewNote}
                  </p>
                )}
                {film.reviewedAt && (
                  <p className="mt-2 text-xs text-flex-muted">
                    Examiné le{" "}
                    {new Intl.DateTimeFormat("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(film.reviewedAt)}
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-flex-muted">{label}</div>
      <div className="mt-0.5 font-medium text-flex-text">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending_review: { label: "En attente", cls: "bg-amber-500/10 text-amber-400" },
    approved: { label: "Approuvé", cls: "bg-emerald-500/10 text-emerald-400" },
    rejected: { label: "Rejeté", cls: "bg-red-500/10 text-red-400" },
    awaiting_parent_approval: {
      label: "Attente créateur parent",
      cls: "bg-blue-500/10 text-blue-400",
    },
  };
  const cfg = status && map[status];
  if (!cfg) return null;
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
