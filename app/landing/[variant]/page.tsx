import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  LANDING_VARIANTS,
  getLandingVariant,
  type LandingVariant,
} from "@/lib/landings";
import LandingTracker from "@/components/LandingTracker";

export const dynamic = "force-static";

export async function generateStaticParams() {
  return Object.keys(LANDING_VARIANTS).map((variant) => ({ variant }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ variant: string }>;
}): Promise<Metadata> {
  const { variant } = await params;
  const v = getLandingVariant(variant);
  if (!v) return { title: "AIflex" };
  return {
    title: `${v.headline} — AIflex`,
    description: v.subhead,
    openGraph: {
      title: v.headline,
      description: v.subhead,
      url: `/landing/${v.slug}`,
      siteName: "AIflex",
    },
  };
}

const VIBE_BG: Record<LandingVariant["vibe"], string> = {
  cinema: "from-flex-accent/20 via-flex-bg to-purple-900/20",
  kids: "from-emerald-400/20 via-flex-bg to-cyan-500/20",
  creator: "from-flex-gold/20 via-flex-bg to-flex-accent/20",
};

/**
 * A/B-able landing page (V8 §27.5).
 *
 * URL pattern: /landing/[variant]?utm_source=<src>&utm_campaign=<cmp>
 * The variant is statically generated from `LANDING_VARIANTS`. UTM params
 * are captured client-side by `LandingTracker` which fires a PostHog
 * event so funnels can be sliced by source × variant.
 */
export default async function LandingPage({
  params,
}: {
  params: Promise<{ variant: string }>;
}) {
  const { variant } = await params;
  const v = getLandingVariant(variant);
  if (!v) notFound();

  return (
    <div className={`min-h-screen bg-gradient-to-br ${VIBE_BG[v.vibe]}`}>
      <LandingTracker variant={v.slug} />
      <div className="mx-auto max-w-5xl px-6 py-20 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-flex-accent/30 bg-flex-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-flex-accent">
          Pour les {v.audience}
        </div>
        <h1 className="font-display text-5xl font-black leading-tight tracking-tight sm:text-6xl">
          {v.headline}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-flex-text/85">
          {v.subhead}
        </p>

        <Link
          href={v.ctaHref}
          className="mt-10 inline-block rounded-full bg-gradient-to-r from-flex-accent to-flex-accent2 px-8 py-4 text-base font-medium text-white shadow-glow transition hover:brightness-110"
        >
          {v.ctaLabel} →
        </Link>

        <ul className="mx-auto mt-12 grid max-w-3xl gap-4 text-left sm:grid-cols-3">
          {v.bullets.map((b) => (
            <li
              key={b}
              className="rounded-2xl border border-flex-border bg-flex-panel/80 p-5 text-sm text-flex-text shadow-cinema backdrop-blur"
            >
              ✓ {b}
            </li>
          ))}
        </ul>

        <p className="mt-12 text-xs text-flex-muted">
          Pas convaincu ?{" "}
          <Link href="/" className="text-flex-accent underline">
            Voir la page d&apos;accueil standard
          </Link>
        </p>
      </div>
    </div>
  );
}
