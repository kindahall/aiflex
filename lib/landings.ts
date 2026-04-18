/**
 * Landing-page A/B variant config (V8 §27.5).
 *
 * Variants are referenced by a stable slug used in the URL
 * `/landing/[variant]`. Each variant changes the headline, sub, hero CTA,
 * and image. Conversion is tracked via the `landing_view` /
 * `landing_signup` events in `lib/observability.ts`.
 *
 * Add a variant ↓ — no code changes elsewhere needed.
 */

export interface LandingVariant {
  slug: string;
  audience: string;
  headline: string;
  subhead: string;
  ctaLabel: string;
  ctaHref: string;
  bullets: string[];
  /** Background flavor — used for the hero gradient. */
  vibe: "cinema" | "kids" | "creator";
}

export const LANDING_VARIANTS: Record<string, LandingVariant> = {
  cinephile: {
    slug: "cinephile",
    audience: "cinéphiles",
    headline: "Le film que tu veux. Pas celui que l'algo te donne.",
    subhead:
      "Décris le film que tu cherches, AIflex le génère. Et si tu veux savoir ce qui se passe après, tu génères la suite toi-même.",
    ctaLabel: "Lancer mon premier film",
    ctaHref: "/studio",
    bullets: [
      "Génération sous 15 min pour un épisode 5 min",
      "Catalogue de films IA déjà publiés à explorer",
      "Continue n'importe quel film public en suite officielle",
    ],
    vibe: "cinema",
  },
  kids: {
    slug: "kids",
    audience: "parents",
    headline: "Ton enfant veut un dessin animé pirate ? Crée-le ce soir.",
    subhead:
      "Mini-séries de 5×5 minutes générées en un clic. Profil Kids dédié, contrôle parental, sans pub.",
    ctaLabel: "Créer une mini-série pour mon enfant",
    ctaHref: "/create/series",
    bullets: [
      "Style preset « Pixar enfants » ou « Livre illustré »",
      "Profil Kids + contrôle parental par profil",
      "Cliffhanger automatique pour l'épisode du lendemain",
    ],
    vibe: "kids",
  },
  creator: {
    slug: "creator",
    audience: "créateurs",
    headline: "Génère, publie, gagne des royalties sur tes suites.",
    subhead:
      "Quand un autre créateur génère la suite de ton film, tu touches automatiquement une royalty mensuelle. Modèle Spotify pour les films.",
    ctaLabel: "Devenir créateur AIflex",
    ctaHref: "/studio",
    bullets: [
      "Stripe Connect — versement automatique mensuel",
      "Royalty configurable 5/10/15/20 % sur les suites",
      "Quota Creator Pro inclus à partir de $29/mois",
    ],
    vibe: "creator",
  },
};

export function getLandingVariant(slug: string): LandingVariant | null {
  return LANDING_VARIANTS[slug] ?? null;
}
