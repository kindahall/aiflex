import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mon feed — AIflex",
  description: "Les derniers films publiés par les créateurs que tu suis.",
};

/**
 * Personalised feed (V8 §24.2) — public films published in the last 30 days
 * by creators the user follows. Sorted by `publishedAt` desc.
 *
 * Empty state nudges the user to follow creators if they don't yet.
 */
export default async function FeedPage() {
  const user = await requireUser().catch(() => null);
  if (!user) redirect("/login?redirect=/feed");

  const follows = await prisma.follow.findMany({
    where: { followerId: user.id },
    select: { followedId: true },
    take: 500,
  });
  const followedIds = follows.map((f) => f.followedId);

  let films: Array<{
    id: string;
    title: string | null;
    synopsis: string | null;
    thumbnailUrl: string | null;
    coverUrl: string | null;
    genre: string;
    publishedAt: Date | null;
    slug: string | null;
    owner: { id: string; name: string };
  }> = [];
  if (followedIds.length > 0) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    films = await prisma.project.findMany({
      where: {
        ownerId: { in: followedIds },
        published: true,
        visibility: "public",
        status: "ready",
        publishedAt: { gte: cutoff },
      },
      orderBy: { publishedAt: "desc" },
      take: 60,
      select: {
        id: true,
        title: true,
        synopsis: true,
        thumbnailUrl: true,
        coverUrl: true,
        genre: true,
        publishedAt: true,
        slug: true,
        owner: { select: { id: true, name: true } },
      },
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-10 animate-fadeUp">
        <h1 className="font-display text-4xl font-bold sm:text-5xl">Mon feed</h1>
        <p className="mt-3 max-w-2xl text-flex-muted">
          Les 30 derniers jours des créateurs que tu suis.
        </p>
      </header>

      {followedIds.length === 0 ? (
        <EmptyState
          title="Tu ne suis personne pour l'instant"
          message="Explore des créateurs depuis le catalogue et clique sur « Suivre » pour les voir apparaître ici."
          cta="Voir les créateurs"
          ctaHref="/creators"
        />
      ) : films.length === 0 ? (
        <EmptyState
          title="Rien de neuf"
          message="Aucun de tes créateurs suivis n'a publié dans les 30 derniers jours."
          cta="Catalogue"
          ctaHref="/library"
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {films.map((f) => (
            <li
              key={f.id}
              className="overflow-hidden rounded-3xl border border-flex-border bg-flex-panel transition hover:border-flex-accent/50"
            >
              <Link href={`/watch/${f.slug ?? f.id}`}>
                <div className="relative aspect-video bg-flex-card">
                  {f.thumbnailUrl ? (
                    <Image
                      src={f.thumbnailUrl}
                      alt={f.title ?? ""}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-flex-muted">—</div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="line-clamp-1 font-medium">{f.title ?? "Sans titre"}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-flex-muted">{f.synopsis}</p>
                  <div className="mt-3 flex items-baseline justify-between text-xs text-flex-muted">
                    <span>par {f.owner.name}</span>
                    <span>{relativeDate(f.publishedAt)}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({
  title,
  message,
  cta,
  ctaHref,
}: {
  title: string;
  message: string;
  cta: string;
  ctaHref: string;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-flex-border p-12 text-center">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-flex-muted">{message}</p>
      <Link
        href={ctaHref}
        className="mt-4 inline-block rounded-full bg-flex-accent px-5 py-2 text-sm font-medium text-white"
      >
        {cta}
      </Link>
    </div>
  );
}

function relativeDate(d: Date | null): string {
  if (!d) return "";
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return "aujourd'hui";
  if (days < 7) return `il y a ${days}j`;
  if (days < 30) return `il y a ${Math.floor(days / 7)}sem`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(d);
}
