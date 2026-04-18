import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 60;

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const item = await prisma.watchlist
    .findFirst({
      where: { shareToken: token, isPublic: true },
      select: { user: { select: { name: true } } },
    })
    .catch(() => null);
  return {
    title: item ? `Watchlist de ${item.user.name} — AIflex` : "Watchlist — AIflex",
    description: "Liste de films AIflex partagée publiquement.",
    robots: { index: true },
  };
}

/**
 * Public read-only watchlist (V8 §22.3). The owner generates a token from
 * /watchlist (POST /api/me/watchlist/share) which they can share anywhere.
 * Visitors don't need to log in.
 */
export default async function PublicListPage({ params }: PageProps) {
  const { token } = await params;
  const items = await prisma.watchlist.findMany({
    where: { shareToken: token, isPublic: true },
    orderBy: { addedAt: "desc" },
    include: {
      user: { select: { id: true, name: true } },
      project: {
        select: {
          id: true,
          title: true,
          synopsis: true,
          thumbnailUrl: true,
          coverUrl: true,
          genre: true,
          published: true,
          visibility: true,
          status: true,
          slug: true,
        },
      },
    },
  });

  if (items.length === 0) notFound();

  const owner = items[0].user;
  // Hide private/unpublished films from the public view — owner may have
  // added them while they were public and demoted them later.
  const visible = items.filter(
    (i) => i.project.published && i.project.visibility === "public" && i.project.status === "ready"
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-10">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Watchlist partagée
        </div>
        <h1 className="font-display text-4xl font-bold sm:text-5xl">
          La liste de {owner.name}
        </h1>
        <p className="mt-3 max-w-2xl text-flex-muted">
          {visible.length} film{visible.length > 1 ? "s" : ""} sélectionné
          {visible.length > 1 ? "s" : ""} par{" "}
          <Link href={`/u/${owner.id}`} className="text-flex-accent underline">
            {owner.name}
          </Link>
          .
        </p>
      </header>

      {visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-flex-border p-12 text-center text-sm text-flex-muted">
          Cette liste ne contient plus de films publics.
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((it) => (
            <li
              key={it.id}
              className="overflow-hidden rounded-3xl border border-flex-border bg-flex-panel transition hover:border-flex-accent/50"
            >
              <Link href={`/watch/${it.project.slug ?? it.project.id}`}>
                <div className="relative aspect-video bg-flex-card">
                  {it.project.thumbnailUrl ? (
                    <Image
                      src={it.project.thumbnailUrl}
                      alt={it.project.title ?? ""}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-flex-muted">—</div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="line-clamp-1 font-medium">{it.project.title ?? "Sans titre"}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-flex-muted">{it.project.synopsis}</p>
                  <div className="mt-2 text-[10px] uppercase tracking-wider text-flex-muted">
                    {it.project.genre}
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
