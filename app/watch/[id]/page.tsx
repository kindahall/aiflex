import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import WatchPlayer from "@/components/WatchPlayer";
import EpisodeNav from "@/components/EpisodeNav";
import CommentsSection from "@/components/CommentsSection";
import SimilarProjectsRow from "@/components/SimilarProjectsRow";
import EngagementBar from "@/components/EngagementBar";
import RemixButton from "@/components/RemixButton";
import ReportButton from "@/components/ReportButton";
import ShareButtons from "@/components/ShareButtons";
import SequelBadge from "@/components/SequelBadge";
import { CATALOG, getCatalogItem } from "@/lib/catalog";
import {
  findUserById,
  getProjectById,
  updateProject,
} from "@/lib/server-db";
import { prisma } from "@/lib/prisma";
import type { CatalogItem, Project } from "@/lib/types";

interface ParentFilmInfo {
  id: string;
  title: string;
}

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://aiflex.app";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Dynamic OG meta tags so shared links on Twitter/Discord/iMessage render
 * a rich preview with the film title, logline and cover image.
 * Includes JSON-LD VideoObject structured data for search engines.
 */
export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { id } = await params;

  if (id.startsWith("p_")) {
    const project = await getProjectById(id);
    if (project?.concept) {
      const cover =
        project.coverUrl ||
        project.scenes?.[0]?.imageUrl ||
        `https://picsum.photos/seed/feed-${id}/1280/720`;
      const owner = await findUserById(project.ownerId);
      const authorName = owner?.name || project.author || "Créateur AIflex";
      const sceneCount = project.scenes?.length || 0;
      const durationSec = sceneCount * 8;

      return {
        title: project.concept.title,
        description: project.concept.logline,
        alternates: { canonical: `${BASE_URL}/watch/${id}` },
        openGraph: {
          title: project.concept.title,
          description: project.concept.logline,
          url: `${BASE_URL}/watch/${id}`,
          siteName: "AIflex",
          images: [{ url: cover, width: 1280, height: 720, alt: project.concept.title }],
          type: "video.movie",
        },
        twitter: {
          card: "summary_large_image",
          title: project.concept.title,
          description: project.concept.logline,
          images: [cover],
        },
        other: {
          "video:duration": String(durationSec),
          "video:release_date": project.publishedAt
            ? new Date(project.publishedAt).toISOString()
            : "",
          "article:author": authorName,
        },
      };
    }
  }

  const item = getCatalogItem(id);
  if (item) {
    return {
      title: item.title,
      description: item.tagline,
      alternates: { canonical: `${BASE_URL}/watch/${id}` },
      openGraph: {
        title: item.title,
        description: item.tagline,
        url: `${BASE_URL}/watch/${id}`,
        siteName: "AIflex",
        images: [{ url: item.backdropUrl, width: 1920, height: 1080, alt: item.title }],
        type: "video.movie",
      },
      twitter: {
        card: "summary_large_image",
        title: item.title,
        description: item.tagline,
        images: [item.backdropUrl],
      },
    };
  }

  return { title: "AIflex" };
}

/**
 * Universal /watch/[id] route. Two cases:
 *   - id starts with "p_"  -> a user-published project. Render via AssemblyPlayer.
 *   - otherwise            -> a hardcoded catalog item (demo placeholder).
 */
export default async function WatchPage({ params }: Props) {
  const { id } = await params;

  // -------- User-created project ---------------------------------------
  if (id.startsWith("p_")) {
    const project = await getProjectById(id);
    if (
      !project ||
      !project.published ||
      project.visibility !== "public" ||
      !project.concept
    ) {
      notFound();
    }

    // Fire-and-forget view bump. Don't await — page render shouldn't wait.
    updateProject(id, { views: (project.views || 0) + 1 }).catch(() => {});

    const owner = await findUserById(project.ownerId);
    const authorName =
      owner?.name || project.author || "Créateur AIflex";

    // V8 §20.5 — sequel attribution badge. The legacy JSON Project type
    // doesn't carry parentFilmId, so we look it up via Prisma directly.
    let parentFilm: ParentFilmInfo | null = null;
    try {
      const prismaProject = await prisma.project.findUnique({
        where: { id: project.id },
        select: { parentFilmId: true },
      });
      if (prismaProject?.parentFilmId) {
        const parent = await prisma.project.findUnique({
          where: { id: prismaProject.parentFilmId },
          select: { id: true, title: true, slug: true },
        });
        if (parent) {
          parentFilm = {
            id: parent.slug ?? parent.id,
            title: parent.title ?? "œuvre originale",
          };
        }
      }
    } catch {
      // Prisma unavailable in JSON-only mode → just skip the badge.
    }

    return (
      <UserFilmView
        project={project}
        authorName={authorName}
        parentFilm={parentFilm}
      />
    );
  }

  // -------- Catalog item (demo placeholders) ---------------------------
  const item = getCatalogItem(id);
  if (!item) notFound();

  const similar = CATALOG.filter(
    (c) => c.id !== item.id && c.genre === item.genre
  ).slice(0, 4);

  return <CatalogItemView item={item} similar={similar} />;
}

// =====================================================================
// User film view — uses the AssemblyPlayer for actual playback
// =====================================================================

function UserFilmView({
  project,
  authorName,
  parentFilm,
}: {
  project: Project;
  authorName: string;
  parentFilm: ParentFilmInfo | null;
}) {
  const scenes = project.scenes || [];
  const concept = project.concept!;
  const sceneCount = scenes.length;
  const videoCount = scenes.filter((s) => s.videoUrl).length;
  const durationMin = Math.max(1, Math.round((sceneCount * 8) / 60));
  const year = new Date(project.publishedAt || project.updatedAt).getFullYear();
  const cover =
    project.coverUrl ||
    project.scenes?.[0]?.imageUrl ||
    `https://picsum.photos/seed/feed-${project.id}/1280/720`;

  const videoJsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: concept.title,
    description: concept.logline || concept.synopsis || project.idea,
    thumbnailUrl: cover,
    uploadDate: project.publishedAt
      ? new Date(project.publishedAt).toISOString()
      : new Date(project.createdAt).toISOString(),
    duration: `PT${sceneCount * 8}S`,
    contentUrl: `${BASE_URL}/watch/${project.id}`,
    embedUrl: `${BASE_URL}/watch/${project.id}`,
    author: {
      "@type": "Person",
      name: authorName,
      url: `${BASE_URL}/u/${project.ownerId}`,
    },
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/WatchAction",
        userInteractionCount: project.views || 0,
      },
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/LikeAction",
        userInteractionCount: project.likes || 0,
      },
    ],
    genre: project.genre,
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(videoJsonLd) }}
      />
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-flex-accent">
        ✦ Créé sur AIflex
      </div>
      {parentFilm && (
        <div className="mb-3">
          <SequelBadge
            parentFilmId={parentFilm.id}
            parentTitle={parentFilm.title}
          />
        </div>
      )}
      <h1 className="mb-3 text-5xl font-black tracking-tight">
        {concept.title}
      </h1>
      {concept.logline && (
        <p className="mb-6 text-xl italic text-flex-muted">{concept.logline}</p>
      )}

      {project.seriesId && (
        <EpisodeNav projectId={project.id} publicOnly />
      )}

      <div className="mb-8">
        <WatchPlayer
          projectId={project.id}
          scenes={scenes}
          title={concept.title}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <EngagementBar
          projectId={project.id}
          initialLikes={project.likes || 0}
        />
        <RemixButton projectId={project.id} />
        <ShareButtons
          title={concept.title}
          path={`/watch/${project.id}`}
        />
        <ReportButton targetType="project" targetId={project.id} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-widest text-flex-muted">
        <span>{project.genre}</span>
        <span>·</span>
        <span>{project.format}</span>
        <span>·</span>
        <span>{project.tone}</span>
        <span>·</span>
        <span>{durationMin} min</span>
        <span>·</span>
        <span>
          {videoCount} / {sceneCount} scènes vidéo
        </span>
        <span>·</span>
        <span>{year}</span>
        <span>·</span>
        <span>👁 {project.views || 0}</span>
        <span>·</span>
        <span>♥ {project.likes || 0}</span>
      </div>

      {concept.synopsis && (
        <p className="mb-8 max-w-3xl text-base leading-relaxed text-flex-text/90">
          {concept.synopsis}
        </p>
      )}

      <div className="mb-10 flex items-center gap-3 rounded-xl border border-flex-border bg-flex-card p-4 transition hover:border-flex-accent">
        <Link
          href={`/u/${project.ownerId}`}
          className="flex flex-1 items-center gap-3"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-flex-accent2 font-bold">
            {authorName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
              Créé par la communauté IA
            </div>
            <div className="truncate text-base font-bold">{authorName}</div>
            <div className="text-[10px] text-flex-accent">
              Voir le profil →
            </div>
          </div>
        </Link>
        <Link
          href="/studio"
          className="ml-auto shrink-0 rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-text transition hover:border-flex-accent"
        >
          + Nouveau film →
        </Link>
      </div>

      <SimilarProjectsRow projectId={project.id} />

      <CommentsSection
        projectId={project.id}
        filmOwnerId={project.ownerId}
      />
    </div>
  );
}

// =====================================================================
// Catalog item view — original demo placeholder layout
// =====================================================================

function CatalogItemView({
  item,
  similar,
}: {
  item: CatalogItem;
  similar: CatalogItem[];
}) {
  return (
    <div>
      <div className="relative h-[70vh] min-h-[480px] w-full overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${item.backdropUrl})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-flex-bg via-flex-bg/60 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="flex h-24 w-24 items-center justify-center rounded-full bg-flex-accent/90 text-4xl text-white shadow-[0_0_60px_rgba(255,46,99,0.5)]"
            aria-label="Démo — pas de fichier vidéo"
            title="Démo — pas de fichier vidéo"
          >
            ▶
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-flex-muted">
          <span>{item.genre}</span>
          <span>·</span>
          <span>{item.year}</span>
          <span>·</span>
          <span>{item.durationMin} min</span>
          <span>·</span>
          <span className="text-flex-gold">★ {item.rating.toFixed(1)}</span>
        </div>
        <h1 className="mb-4 text-5xl font-black tracking-tight">
          {item.title}
        </h1>
        <p className="mb-4 text-xl italic text-flex-muted">{item.tagline}</p>
        <p className="mb-8 max-w-3xl text-base leading-relaxed text-flex-text/90">
          {item.description}
        </p>
        <div className="mb-6 rounded-xl border border-flex-accent2/30 bg-flex-accent2/5 p-4 text-xs text-flex-muted">
          ℹ Cet item est une <strong>démo de catalogue</strong> pour
          illustrer les styles supportés. Pour regarder un vrai film, ouvre
          la rangée <em>« ✦ Créés sur AIflex »</em> sur l&apos;accueil ou
          lance ton premier projet dans le studio.
        </div>
        <div className="mb-10 flex items-center gap-3 rounded-xl border border-flex-border bg-flex-card p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-flex-accent2 font-bold">
            {item.author.charAt(0)}
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-flex-muted">
              {item.communityCreated
                ? "Créé par la communauté IA"
                : "Réalisé par"}
            </div>
            <div className="text-base font-bold">{item.author}</div>
          </div>
          <Link
            href="/studio"
            className="ml-auto rounded-lg border border-flex-border bg-flex-panel px-4 py-2 text-xs font-semibold text-flex-text transition hover:border-flex-accent"
          >
            Créer dans le même style →
          </Link>
        </div>

        <h2 className="mb-4 text-2xl font-black">Films similaires</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {similar.map((s) => (
            <Link
              key={s.id}
              href={`/watch/${s.id}`}
              className="group relative block aspect-video overflow-hidden rounded-lg bg-flex-card shadow-cinema"
            >
              <div
                className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-110"
                style={{ backgroundImage: `url(${s.coverUrl})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3">
                <div className="text-sm font-bold">{s.title}</div>
                <div className="text-[10px] text-flex-muted">
                  ★ {s.rating.toFixed(1)} · {s.durationMin} min
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
