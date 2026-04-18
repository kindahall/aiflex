import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import BoostSelector from "@/components/BoostSelector";
import type { BoostType } from "@/lib/types/film";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ filmId: string }>;
}): Promise<Metadata> {
  const { filmId } = await params;
  const film = await prisma.project
    .findUnique({
      where: { id: filmId },
      select: { title: true },
    })
    .catch(() => null);
  const title = film?.title
    ? `Booster « ${film.title} » — AIflex`
    : "Booster un film — AIflex";
  return {
    title,
    description:
      "Augmente la visibilité de ton film AIflex avec un boost homepage, catégorie ou badge.",
    robots: { index: false },
  };
}

export default async function BoostPage({
  params,
  searchParams,
}: {
  params: Promise<{ filmId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { filmId } = await params;
  const { status } = await searchParams;

  const user = await requireUser().catch(() => null);
  if (!user) {
    redirect(`/login?redirect=/boost/${filmId}`);
  }

  const film = await prisma.project.findUnique({
    where: { id: filmId },
    select: {
      id: true,
      ownerId: true,
      title: true,
      synopsis: true,
      thumbnailUrl: true,
      coverUrl: true,
      views: true,
      status: true,
      visibility: true,
    },
  });
  if (!film) notFound();

  const isOwner = film.ownerId === user.id;

  const activeBoosts = await prisma.filmBoost.findMany({
    where: {
      projectId: filmId,
      endAt: { gt: new Date() },
    },
    select: { type: true, endAt: true },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href={`/watch/${filmId}`}
        className="mb-6 inline-flex items-center gap-2 text-sm text-flex-muted hover:text-flex-text"
      >
        ← Retour au film
      </Link>

      {status === "success" && (
        <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-400">
          ✅ Paiement reçu ! Ton boost est en cours d&apos;activation (quelques
          secondes le temps que Stripe confirme le webhook).
        </div>
      )}
      {status === "cancel" && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-400">
          Paiement annulé. Aucun frais n&apos;a été prélevé.
        </div>
      )}

      <header className="mb-10 flex flex-col items-start gap-6 animate-fadeUp sm:flex-row">
        <div className="relative h-52 w-36 flex-shrink-0 overflow-hidden rounded-2xl shadow-cinema ring-1 ring-flex-border sm:h-60 sm:w-40">
          {film.thumbnailUrl ? (
            <Image src={film.thumbnailUrl} alt={film.title ?? ""} fill className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center bg-flex-card text-flex-muted">—</div>
          )}
        </div>
        <div className="flex-1">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
            Boost visibilité
          </div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">
            {film.title ?? "Sans titre"}
          </h1>
          <p className="mt-2 max-w-xl text-flex-muted">
            {film.synopsis ?? "Mets ton film devant plus de spectateurs."}
          </p>
          <div className="mt-3 flex gap-2 text-xs">
            <span className="rounded-full bg-flex-card px-3 py-1 text-flex-muted">
              {film.views.toLocaleString("fr-FR")} vues
            </span>
            {activeBoosts.length > 0 && (
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-400">
                {activeBoosts.length} boost{activeBoosts.length > 1 ? "s" : ""} actif
                {activeBoosts.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </header>

      {!isOwner ? (
        <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8 text-center">
          <h2 className="font-display text-xl font-semibold text-amber-400">
            Action réservée au créateur
          </h2>
          <p className="mt-2 text-sm text-flex-muted">
            Seul le propriétaire du film peut acheter un boost. Tu peux en
            revanche soutenir le créateur via un tip sur la page du film.
          </p>
        </section>
      ) : film.status !== "ready" || film.visibility !== "public" ? (
        <section className="rounded-3xl border border-flex-border bg-flex-panel p-8 text-center">
          <h2 className="font-display text-xl font-semibold">
            Ce film n&apos;est pas encore éligible au boost
          </h2>
          <p className="mt-2 text-sm text-flex-muted">
            Le film doit être <code>public</code> et <code>ready</code> pour
            être boosté. Change sa visibilité depuis son espace d&apos;édition
            avant d&apos;acheter un boost.
          </p>
        </section>
      ) : (
        <BoostSelector
          projectId={filmId}
          activeBoosts={activeBoosts.map((b) => ({
            type: b.type as BoostType,
            endAt: b.endAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
