import Link from "next/link";
import { CATALOG } from "@/lib/catalog";
import { findUserById, listPublicProjects } from "@/lib/server-db";
import type { Project } from "@/lib/types";
import { placeholderFor } from "@/lib/visuals";

/**
 * Trending / Top 10 page. Ranks community films by engagement (likes +
 * views weighted), with a separate catalog "staff picks" section. Server
 * component for instant SEO-friendly rendering.
 */
export default async function TrendingPage() {
  const allPublic = await listPublicProjects();

  // Score = likes * 3 + views (likes weighted higher — active engagement).
  const ranked = [...allPublic]
    .map((p) => ({
      project: p,
      score: (p.likes || 0) * 3 + (p.views || 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  const catalogTop = [...CATALOG]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        Classement
      </div>
      <h1 className="mb-3 text-5xl font-black tracking-tight">
        Top films AIflex
      </h1>
      <p className="mb-10 max-w-2xl text-base text-flex-muted">
        Les films les plus aimés et regardés par la communauté, classés
        par engagement.
      </p>

      {ranked.length === 0 ? (
        <div className="rounded-2xl border border-flex-border bg-flex-card p-12 text-center">
          <div className="mb-3 text-5xl">🏆</div>
          <h3 className="mb-2 text-xl font-bold">
            Pas encore de classement
          </h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-flex-muted">
            Publie le premier film et lance le mouvement.
          </p>
          <Link
            href="/studio"
            className="inline-block rounded-lg bg-flex-accent px-6 py-3 text-sm font-bold text-white"
          >
            + Créer un film
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {ranked.map(({ project, score }, i) => (
            <RankedCard
              key={project.id}
              project={project}
              rank={i + 1}
              score={score}
            />
          ))}
        </div>
      )}

      {catalogTop.length > 0 && (
        <div className="mt-16">
          <h2 className="mb-4 text-2xl font-black">
            Sélection du catalogue
          </h2>
          <p className="mb-6 text-sm text-flex-muted">
            Films démo les mieux notés pour illustrer les styles
            supportés.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {catalogTop.map((c) => (
              <Link
                key={c.id}
                href={`/watch/${c.id}`}
                className="group overflow-hidden rounded-2xl border border-flex-border bg-flex-card shadow-cinema transition hover:border-flex-accent"
              >
                <div className="relative aspect-video w-full">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${c.coverUrl})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                </div>
                <div className="p-4">
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-flex-muted">
                    {c.genre} · {c.durationMin} min
                  </div>
                  <h3 className="truncate text-base font-bold transition group-hover:text-flex-accent">
                    {c.title}
                  </h3>
                  <div className="mt-1 text-[10px] text-flex-gold">
                    ★ {c.rating.toFixed(1)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

async function RankedCard({
  project,
  rank,
  score,
}: {
  project: Project;
  rank: number;
  score: number;
}) {
  const owner = await findUserById(project.ownerId);
  const cover =
    project.coverUrl ||
    project.scenes?.[0]?.imageUrl ||
    placeholderFor(`feed-${project.id}`, 1280, 720);

  const isTop3 = rank <= 3;

  return (
    <Link
      href={`/watch/${project.id}`}
      className={`group flex items-center gap-5 overflow-hidden rounded-2xl border p-3 transition hover:border-flex-accent ${
        isTop3
          ? "border-flex-accent/30 bg-flex-accent/5"
          : "border-flex-border bg-flex-card"
      }`}
    >
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl font-display text-2xl font-black ${
          rank === 1
            ? "bg-flex-gold/20 text-flex-gold"
            : rank === 2
              ? "bg-gray-300/20 text-gray-300"
              : rank === 3
                ? "bg-orange-700/20 text-orange-500"
                : "bg-flex-panel text-flex-muted"
        }`}
      >
        {rank}
      </div>
      <div
        className="h-20 w-36 shrink-0 rounded-lg bg-cover bg-center transition duration-500 group-hover:scale-105"
        style={{ backgroundImage: `url(${cover})` }}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
          {project.genre} · {project.format}
        </div>
        <h3 className="truncate text-lg font-bold transition group-hover:text-flex-accent">
          {project.concept?.title || "Sans titre"}
        </h3>
        <p className="line-clamp-1 text-xs text-flex-muted">
          {project.concept?.logline || project.idea}
        </p>
        <div className="mt-1 text-[10px] text-flex-muted">
          par{" "}
          <span className="font-semibold text-flex-text">
            {owner?.name || project.author || "Créateur AIflex"}
          </span>
        </div>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <div className="text-xl font-black text-flex-accent">
          ♥ {project.likes || 0}
        </div>
        <div className="text-[10px] text-flex-muted">
          👁 {project.views || 0}
        </div>
      </div>
    </Link>
  );
}
