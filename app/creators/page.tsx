import Link from "next/link";
import type { Metadata } from "next";
import FollowButton from "@/components/FollowButton";
import {
  getFollowerCount,
  listPublicProjects,
  listUsers,
  toPublicUser,
} from "@/lib/server-db";

export const metadata: Metadata = {
  title: "Créateurs — AIflex",
  description:
    "Découvre les créateurs AIflex et suis ceux qui t'inspirent.",
};

/**
 * Public directory of creators. Shows users who have published at least
 * one public film, sorted by total likes (most popular first).
 */
export default async function CreatorsPage() {
  const allUsers = await listUsers();
  const allPublic = await listPublicProjects();

  // Build creator cards with their stats.
  const creators = await Promise.all(
    allUsers
      .filter((u) => !u.suspended)
      .map(async (u) => {
        const films = allPublic.filter((p) => p.ownerId === u.id);
        if (films.length === 0) return null;
        const totalLikes = films.reduce((n, p) => n + (p.likes || 0), 0);
        const totalViews = films.reduce((n, p) => n + (p.views || 0), 0);
        const followers = await getFollowerCount(u.id);
        return {
          user: toPublicUser(u),
          filmCount: films.length,
          totalLikes,
          totalViews,
          followers,
          latestFilm: films[0],
        };
      })
  );

  const ranked = creators
    .filter(Boolean)
    .sort((a, b) => b!.totalLikes - a!.totalLikes) as NonNullable<
    (typeof creators)[number]
  >[];

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        Communauté
      </div>
      <h1 className="mb-3 text-5xl font-black tracking-tight">
        Créateurs AIflex
      </h1>
      <p className="mb-10 max-w-xl text-base text-flex-muted">
        Découvre les réalisateurs IA les plus talentueux. Suis-les pour
        ne rien manquer de leurs prochains films.
      </p>

      {ranked.length === 0 ? (
        <div className="rounded-2xl border border-flex-border bg-flex-card p-12 text-center">
          <div className="mb-3 text-5xl">🎬</div>
          <h3 className="mb-2 text-xl font-bold">
            Pas encore de créateurs
          </h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-flex-muted">
            Sois le premier à publier un film et à apparaître ici.
          </p>
          <Link
            href="/studio"
            className="inline-block rounded-lg bg-flex-accent px-6 py-3 text-sm font-bold text-white transition hover:brightness-110"
          >
            + Créer un film
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ranked.map((c) => (
            <div
              key={c.user.id}
              className="rounded-2xl border border-flex-border bg-flex-card p-6 transition hover:border-flex-accent"
            >
              <div className="mb-4 flex items-center gap-4">
                <Link
                  href={`/u/${c.user.id}`}
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-flex-accent text-2xl font-black text-white transition hover:scale-105"
                >
                  {c.user.name.charAt(0).toUpperCase()}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/u/${c.user.id}`}
                    className="block truncate text-lg font-bold transition hover:text-flex-accent"
                  >
                    {c.user.name}
                  </Link>
                  {c.user.bio && (
                    <p className="line-clamp-1 text-xs text-flex-muted">
                      {c.user.bio}
                    </p>
                  )}
                </div>
              </div>

              <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-black">{c.filmCount}</div>
                  <div className="text-[10px] text-flex-muted">films</div>
                </div>
                <div>
                  <div className="text-lg font-black text-flex-accent">
                    {c.followers}
                  </div>
                  <div className="text-[10px] text-flex-muted">abonnés</div>
                </div>
                <div>
                  <div className="text-lg font-black">{c.totalLikes}</div>
                  <div className="text-[10px] text-flex-muted">likes</div>
                </div>
              </div>

              {/* Latest film preview */}
              {c.latestFilm?.concept && (
                <Link
                  href={`/watch/${c.latestFilm.id}`}
                  className="mb-4 block rounded-xl border border-flex-border bg-flex-panel p-3 transition hover:border-flex-accent"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
                    Dernier film
                  </div>
                  <div className="truncate text-sm font-bold">
                    {c.latestFilm.concept.title}
                  </div>
                  <div className="truncate text-[10px] text-flex-muted">
                    {c.latestFilm.concept.logline}
                  </div>
                </Link>
              )}

              <FollowButton userId={c.user.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
