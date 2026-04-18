import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  countCommentsForProject,
  findUserById,
  getFollowerCount,
  getFollowingCount,
  listPublicProjects,
} from "@/lib/server-db";
import { computeBadges, TIER_COLORS, type Badge } from "@/lib/badges";
import FollowButton from "@/components/FollowButton";
import TipButton from "@/components/TipButton";
import type { Project } from "@/lib/types";
import { placeholderFor } from "@/lib/visuals";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://aiflex.app";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Dynamic metadata for creator profiles — OG tags with name and stats.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await findUserById(id);
  if (!user) return { title: "Profil introuvable — AIflex" };

  const allPublic = await listPublicProjects();
  const films = allPublic.filter((p) => p.ownerId === id);
  const totalLikes = films.reduce((n, p) => n + (p.likes || 0), 0);

  const description =
    user.bio ||
    `${user.name} — ${films.length} film${films.length !== 1 ? "s" : ""} publiés, ${totalLikes} likes sur AIflex.`;

  return {
    title: user.name,
    description,
    alternates: { canonical: `${BASE_URL}/u/${id}` },
    openGraph: {
      type: "profile",
      title: `${user.name} — Créateur AIflex`,
      description,
      url: `${BASE_URL}/u/${id}`,
      siteName: "AIflex",
      images: [
        {
          url: `${BASE_URL}/og-image.png`,
          width: 1200,
          height: 630,
          alt: user.name,
        },
      ],
    },
    twitter: {
      card: "summary",
      title: `${user.name} — Créateur AIflex`,
      description,
    },
  };
}

/**
 * Public creator profile. Server component — reads directly from the DB
 * (no internal HTTP round-trip), then composes a static page. Anything
 * dynamic (live likes etc.) would happen client-side.
 */
export default async function CreatorProfilePage({ params }: Props) {
  const { id } = await params;
  const user = await findUserById(id);
  if (!user) notFound();

  const allPublic = await listPublicProjects();
  const films = allPublic.filter((p) => p.ownerId === id);

  const totalLikes = films.reduce((n, p) => n + (p.likes || 0), 0);
  const totalViews = films.reduce((n, p) => n + (p.views || 0), 0);
  const totalScenes = films.reduce((n, p) => n + (p.scenes?.length || 0), 0);
  const totalVideos = films.reduce(
    (n, p) => n + (p.scenes?.filter((s) => s.videoUrl).length || 0),
    0
  );

  const followerCount = await getFollowerCount(id);
  const followingCount = await getFollowingCount(id);

  // Badge computation
  let totalComments = 0;
  for (const p of films) {
    totalComments += await countCommentsForProject(p.id);
  }
  const remixCount = allPublic.filter(
    (p) =>
      p.ownerId !== id &&
      films.some(
        (f) =>
          f.concept?.title &&
          p.idea.includes(`Remix de « ${f.concept.title} »`)
      )
  ).length;

  const badges = computeBadges({
    publishedFilms: films.length,
    totalLikes,
    totalViews,
    totalScenes,
    totalVideos,
    totalComments,
    remixCount,
  });

  const memberSince = new Date(user.createdAt).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: user.name,
    url: `${BASE_URL}/u/${id}`,
    description: user.bio || `Créateur sur AIflex avec ${films.length} film${films.length !== 1 ? "s" : ""} publiés.`,
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/FollowAction",
        userInteractionCount: followerCount,
      },
    ],
    sameAs: `${BASE_URL}/u/${id}`,
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
      <div className="mb-10 flex flex-wrap items-start gap-6 rounded-3xl border border-flex-border bg-flex-card p-8 shadow-cinema">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-flex-accent text-4xl font-black text-white shadow-glow">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
            Créateur AIflex
          </div>
          <h1 className="mb-1 text-4xl font-black tracking-tight">
            {user.name}
          </h1>
          <p className="text-sm text-flex-muted">
            Membre depuis {memberSince}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <FollowButton userId={id} />
            <TipButton creatorId={id} creatorName={user.name} />
            <div className="flex items-center gap-4 text-xs text-flex-muted">
              <span>
                <strong className="text-flex-text">{followerCount}</strong>{" "}
                abonné{followerCount > 1 ? "s" : ""}
              </span>
              <span>
                <strong className="text-flex-text">{followingCount}</strong>{" "}
                abonnement{followingCount > 1 ? "s" : ""}
              </span>
            </div>
          </div>
          {user.bio && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-flex-text/90">
              {user.bio}
            </p>
          )}
        </div>
      </div>

      <div className="mb-10 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
        <Stat label="Films publiés" value={films.length} />
        <Stat label="♥ Likes cumulés" value={totalLikes} accent />
        <Stat label="👁 Vues cumulées" value={totalViews} />
        <Stat label="Vidéos IA générées" value={totalVideos} />
      </div>

      {badges.length > 0 && (
        <div className="mb-10">
          <h2 className="mb-4 text-2xl font-black">Badges</h2>
          <div className="flex flex-wrap gap-3">
            {badges.map((b) => (
              <BadgeCard key={b.id} badge={b} />
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-4 text-2xl font-black">Films publiés</h2>

      {films.length === 0 ? (
        <div className="rounded-2xl border border-flex-border bg-flex-card p-10 text-center text-sm text-flex-muted">
          Ce créateur n&apos;a encore publié aucun film.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {films.map((p) => (
            <FilmCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <div className="mt-10 text-xs text-flex-muted">
        Total scènes écrites par {user.name} : {totalScenes}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        accent
          ? "border-flex-accent/40 bg-flex-accent/10"
          : "border-flex-border bg-flex-card"
      }`}
    >
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
        {label}
      </div>
      <div className="text-3xl font-black tracking-tight">
        {value.toLocaleString("fr-FR")}
      </div>
    </div>
  );
}

function FilmCard({ project }: { project: Project }) {
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
      </div>
      <div className="p-4">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
          {project.genre} · {project.format}
        </div>
        <h3 className="mb-1 truncate text-base font-bold">
          {project.concept?.title || "Sans titre"}
        </h3>
        <p className="mb-2 line-clamp-2 text-xs text-flex-muted">
          {project.concept?.logline || project.idea}
        </p>
        <div className="flex items-center gap-3 text-[10px] text-flex-muted">
          <span>♥ {project.likes || 0}</span>
          <span>·</span>
          <span>👁 {project.views || 0}</span>
          <span>·</span>
          <span>{project.scenes?.length || 0} scènes</span>
        </div>
      </div>
    </Link>
  );
}

function BadgeCard({ badge }: { badge: Badge }) {
  const colors = TIER_COLORS[badge.tier];
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border bg-gradient-to-br p-4 ${colors}`}
      title={badge.description}
    >
      <span className="text-2xl">{badge.icon}</span>
      <div>
        <div className="text-sm font-bold">{badge.label}</div>
        <div className="text-[10px] opacity-70">{badge.description}</div>
      </div>
    </div>
  );
}
