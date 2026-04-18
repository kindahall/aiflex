import Link from "next/link";
import { notFound } from "next/navigation";
import { CATALOG, byGenre } from "@/lib/catalog";
import { findUserById, listPublicProjects } from "@/lib/server-db";
import type { CatalogItem, Genre, Project } from "@/lib/types";
import { placeholderFor } from "@/lib/visuals";

const GENRE_META: Record<
  Genre,
  { label: string; description: string }
> = {
  "sci-fi": {
    label: "Science-fiction",
    description:
      "Univers futuristes, cyberpunk, space opera, IA conscientes et mondes parallèles.",
  },
  fantasy: {
    label: "Fantasy",
    description:
      "Royaumes oubliés, magie ancienne, quêtes épiques et créatures légendaires.",
  },
  thriller: {
    label: "Thriller",
    description:
      "Suspense, complots, courses contre la montre et retournements de situation.",
  },
  romance: {
    label: "Romance",
    description:
      "Histoires d'amour, rencontres improbables et sentiments intenses.",
  },
  horror: {
    label: "Horreur",
    description:
      "Ambiances terrifiantes, créatures de l'ombre et peurs primales.",
  },
  drama: {
    label: "Drame",
    description:
      "Histoires humaines profondes, émotions fortes et personnages complexes.",
  },
  comedy: {
    label: "Comédie",
    description:
      "Situations absurdes, humour noir et rires de l'inattendu.",
  },
  action: {
    label: "Action",
    description:
      "Courses-poursuites, combats, explosions et adrénaline pure.",
  },
  documentary: {
    label: "Documentaire",
    description:
      "Regards sur le monde, portraits, enquêtes et récits du réel fictionalisé.",
  },
  anime: {
    label: "Anime / Manga",
    description:
      "Esthétique japonaise, key visuals épiques et narratives sérielles.",
  },
  noir: {
    label: "Polar / Noir",
    description:
      "Détectives insomniables, ruelles pluvieuses et vérités inconfortables.",
  },
  western: {
    label: "Western",
    description:
      "Grandes plaines, duels au soleil et justice personnelle.",
  },
};

const VALID_GENRES = new Set(Object.keys(GENRE_META));

interface Props {
  params: Promise<{ genre: string }>;
}

export default async function GenrePage({ params }: Props) {
  const { genre } = await params;
  if (!VALID_GENRES.has(genre)) notFound();

  const g = genre as Genre;
  const meta = GENRE_META[g];

  // Catalog items for this genre
  const catalogItems = byGenre(g);

  // Community films for this genre
  const allPublic = await listPublicProjects();
  const communityFilms = allPublic.filter((p) => p.genre === g);

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        Genre
      </div>
      <h1 className="mb-3 text-5xl font-black tracking-tight">
        {meta.label}
      </h1>
      <p className="mb-10 max-w-2xl text-base text-flex-muted">
        {meta.description}
      </p>

      {communityFilms.length > 0 && (
        <>
          <h2 className="mb-4 text-2xl font-black">
            ✦ Créés par la communauté
          </h2>
          <div className="mb-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {communityFilms.map((p) => (
              <CommunityCard key={p.id} project={p} />
            ))}
          </div>
        </>
      )}

      {catalogItems.length > 0 && (
        <>
          <h2 className="mb-4 text-2xl font-black">Catalogue démo</h2>
          <div className="mb-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {catalogItems.map((c) => (
              <CatalogCard key={c.id} item={c} />
            ))}
          </div>
        </>
      )}

      {communityFilms.length === 0 && catalogItems.length === 0 && (
        <div className="rounded-2xl border border-flex-border bg-flex-card p-12 text-center">
          <div className="mb-3 text-5xl">🎬</div>
          <h3 className="mb-2 text-xl font-bold">
            Aucun film {meta.label.toLowerCase()} pour l&apos;instant
          </h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-flex-muted">
            Sois le premier à créer un film dans ce genre.
          </p>
          <Link
            href="/studio"
            className="inline-block rounded-lg bg-flex-accent px-6 py-3 text-sm font-bold text-white"
          >
            + Créer un film {meta.label.toLowerCase()}
          </Link>
        </div>
      )}

      <div className="mt-10">
        <h3 className="mb-4 text-lg font-bold">Autres genres</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(GENRE_META)
            .filter(([key]) => key !== g)
            .map(([key, val]) => (
              <Link
                key={key}
                href={`/genre/${key}`}
                className="rounded-full border border-flex-border bg-flex-panel px-4 py-1.5 text-xs font-semibold text-flex-text transition hover:border-flex-accent"
              >
                {val.label}
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}

function CommunityCard({ project }: { project: Project }) {
  const cover =
    project.coverUrl ||
    project.scenes?.[0]?.imageUrl ||
    placeholderFor(`feed-${project.id}`, 1280, 720);
  return (
    <Link
      href={`/watch/${project.id}`}
      className="group overflow-hidden rounded-2xl border border-flex-border bg-flex-card shadow-cinema transition hover:border-flex-accent"
    >
      <div className="relative aspect-video w-full">
        <div
          className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url(${cover})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute top-2 left-2 rounded-full bg-flex-accent/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Communauté
        </div>
      </div>
      <div className="p-4">
        <h3 className="mb-1 truncate text-base font-bold transition group-hover:text-flex-accent">
          {project.concept?.title || "Sans titre"}
        </h3>
        <p className="mb-2 line-clamp-2 text-xs text-flex-muted">
          {project.concept?.logline || project.idea}
        </p>
        <div className="flex items-center gap-3 text-[10px] text-flex-muted">
          <span>♥ {project.likes || 0}</span>
          <span>·</span>
          <span>{project.scenes?.length || 0} scènes</span>
        </div>
      </div>
    </Link>
  );
}

function CatalogCard({ item }: { item: CatalogItem }) {
  return (
    <Link
      href={`/watch/${item.id}`}
      className="group overflow-hidden rounded-2xl border border-flex-border bg-flex-card shadow-cinema transition hover:border-flex-accent"
    >
      <div className="relative aspect-video w-full">
        <div
          className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url(${item.coverUrl})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute top-2 left-2 rounded-full bg-flex-accent2/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Démo
        </div>
      </div>
      <div className="p-4">
        <h3 className="mb-1 truncate text-base font-bold transition group-hover:text-flex-accent">
          {item.title}
        </h3>
        <p className="mb-2 line-clamp-2 text-xs text-flex-muted">
          {item.tagline}
        </p>
        <div className="flex items-center gap-3 text-[10px] text-flex-muted">
          <span className="text-flex-gold">★ {item.rating.toFixed(1)}</span>
          <span>·</span>
          <span>{item.durationMin} min</span>
        </div>
      </div>
    </Link>
  );
}
