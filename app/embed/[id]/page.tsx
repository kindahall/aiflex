import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findProjectBySlugOrId } from "@/lib/slug";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://aiflex.app";

/**
 * Public iframe embed (V8 §27.2). Served at /embed/[id] so external sites
 * (blogs, social shares, creator portfolios) can drop in the 30s preview
 * with:
 *   <iframe src="https://aiflex.app/embed/<slug>" allow="autoplay; fullscreen">
 *
 * Security:
 *   - `X-Frame-Options: ALLOWALL` + CSP frame-ancestors `*` — this page
 *     exists explicitly to be embedded anywhere, no clickjacking concern
 *     because it's public video content.
 *   - Only public `status=ready` films are served; private and pending-review
 *     return 404 so private links never leak.
 *   - No cookies needed → no SameSite friction across iframes.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await findProjectBySlugOrId(id).catch(() => null);
  if (!project || project.visibility !== "public") {
    return { title: "AIflex" };
  }
  return {
    title: project.title ?? "AIflex",
    description: project.synopsis ?? undefined,
    robots: { index: false }, // the embed is not the canonical page
  };
}

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await findProjectBySlugOrId(id).catch(() => null);
  if (!project || project.visibility !== "public" || project.status !== "ready") {
    notFound();
  }

  const src = project.outputUrl ?? undefined;
  const poster = project.thumbnailUrl ?? project.coverUrl ?? undefined;
  const canonical = `${APP_URL}/watch/${project.slug ?? project.id}`;

  return (
    <div className="relative h-screen w-screen">
      {src ? (
        <video
          controls
          playsInline
          preload="metadata"
          poster={poster}
          className="h-full w-full object-contain"
        >
          <source src={src} type="video/mp4" />
          Ton navigateur ne peut pas lire cette vidéo.
        </video>
      ) : (
        <div
          className="h-full w-full bg-cover bg-center"
          style={{ backgroundImage: poster ? `url(${poster})` : undefined }}
        />
      )}

      <a
        href={canonical}
        target="_blank"
        rel="noopener"
        className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur hover:bg-black/90"
      >
        Voir sur AIflex →
      </a>

      {project.title && (
        <div className="absolute top-3 left-3 max-w-[70%] rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
          {project.title}
        </div>
      )}
    </div>
  );
}
