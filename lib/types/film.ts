/**
 * Constantes partagées pour la génération de films/séries/suites.
 * Référencé par : agent, prompts, Stripe checkout, payouts, catalogue.
 *
 * Coûts API basés sur Seedance 1.5 Fast via Atlas Cloud : $0.022/seconde.
 * Tarifs en centimes (USD).
 */

// ---------------------------------------------------------------------------
// Enums & types
// ---------------------------------------------------------------------------

export type FilmFormat =
  | "episode_5"   // 5 min
  | "episode_15"  // 15 min
  | "short_30"    // 30 min
  | "film_90"     // 1h30
  | "short_vertical"; // 30-60 s, 9:16

export type FilmVisibility = "private" | "private_circle" | "public";
export type UploadType = "ai_generated" | "user_upload";
export type UserPlan = "free" | "light" | "premium" | "family" | "light_yearly" | "premium_yearly";
export type AdFormat = "preroll_15" | "midroll_30" | "banner";
export type BoostType = "homepage_24h" | "category_7d" | "badge_30d";
export type PayoutType = "primary" | "royalty" | "collab" | "bundle";
export type ReleaseMode = "binge" | "weekly";
export type AdminReviewStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "awaiting_parent_approval";

export type GenerationMode = "express" | "assisted";

export type FilmStatus =
  | "pending"
  | "analyzing"
  | "scenario_ready"
  | "awaiting_validation"
  | "generating_clips"
  | "rendering"
  | "uploading"
  | "scheduled"
  | "pending_review"
  | "ready"
  | "error";

export type GenerationJobStatus =
  | "pending"
  | "analyzing"
  | "scenario_ready"
  | "awaiting_validation"
  | "scheduled"
  | "generating"
  | "done"
  | "error";

export type ReportReason =
  | "inappropriate"
  | "copyright"
  | "csam"
  | "hate"
  | "spam"
  | "other";

export type ContentRating = "kids" | "teens" | "all" | "adult";

export interface Scene {
  id: string;
  index: number;
  prompt: string;
  clipUrl: string | null;
  seedanceJobId: string | null;
  duration: number; // frames à 30fps
  transition: "cut" | "fade" | "dissolve";
  subtitle: string | null;
}

export interface RemotionComposition {
  fps: 30;
  scenes: Scene[];
  music: { url: string; volume: number; fadeOut: boolean } | null;
  totalDurationInFrames: number;
}

// ---------------------------------------------------------------------------
// Formats de film
// ---------------------------------------------------------------------------

export interface FormatConfig {
  label: string;
  durationMinutes: number;
  sceneCount: number;
  apiCostCents: number;  // coût API réel en centimes ($0.022/sec)
  privatePrice: number;  // prix facturé privé en centimes
  publicPrice: number;   // prix facturé public en centimes
  aspectRatio: "16:9" | "9:16";
  estimatedGenerationMinutes: number; // pour calcul scheduledAt
}

export const FORMAT_CONFIG: Record<FilmFormat, FormatConfig> = {
  episode_5: {
    label: "Épisode 5 min",
    durationMinutes: 5,
    sceneCount: 5,
    apiCostCents: 660,
    privatePrice: 999,
    publicPrice: 499,
    aspectRatio: "16:9",
    estimatedGenerationMinutes: 15,
  },
  episode_15: {
    label: "Épisode 15 min",
    durationMinutes: 15,
    sceneCount: 15,
    apiCostCents: 1980,
    privatePrice: 2999,
    publicPrice: 1499,
    aspectRatio: "16:9",
    estimatedGenerationMinutes: 45,
  },
  short_30: {
    label: "Court-métrage 30 min",
    durationMinutes: 30,
    sceneCount: 30,
    apiCostCents: 3960,
    privatePrice: 5999,
    publicPrice: 2999,
    aspectRatio: "16:9",
    estimatedGenerationMinutes: 90,
  },
  film_90: {
    label: "Film complet 1h30",
    durationMinutes: 90,
    sceneCount: 90,
    apiCostCents: 11880,
    privatePrice: 17999,
    publicPrice: 8999,
    aspectRatio: "16:9",
    estimatedGenerationMinutes: 240,
  },
  short_vertical: {
    label: "Short vertical 60s",
    durationMinutes: 1,
    sceneCount: 1,
    apiCostCents: 132,
    privatePrice: 199,
    publicPrice: 99,
    aspectRatio: "9:16",
    estimatedGenerationMinutes: 3,
  },
};

// ---------------------------------------------------------------------------
// Tarifs suites (légèrement réduits car contexte parent fourni)
// ---------------------------------------------------------------------------

export const SEQUEL_PRICE: Record<FilmFormat, number> = {
  episode_5: 999,
  episode_15: 2999,
  short_30: 5999,
  film_90: 16999,
  short_vertical: 199,
};

// ---------------------------------------------------------------------------
// Séries
// ---------------------------------------------------------------------------

export interface SeriesConfig {
  label: string;
  episodeCount: number;
  format: FilmFormat;
  apiCostCents: number;
  privatePrice: number;
  publicPrice: number;
}

export const SERIES_CONFIG: Record<string, SeriesConfig> = {
  mini_5x5: {
    label: "Mini-série 5×5 min",
    episodeCount: 5,
    format: "episode_5",
    apiCostCents: 3300,
    privatePrice: 4999,
    publicPrice: 2499,
  },
  standard_10x5: {
    label: "Série 10×5 min",
    episodeCount: 10,
    format: "episode_5",
    apiCostCents: 6600,
    privatePrice: 9999,
    publicPrice: 4999,
  },
  mini_5x15: {
    label: "Mini-série 5×15 min",
    episodeCount: 5,
    format: "episode_15",
    apiCostCents: 9900,
    privatePrice: 14999,
    publicPrice: 7499,
  },
  standard_10x15: {
    label: "Série 10×15 min",
    episodeCount: 10,
    format: "episode_15",
    apiCostCents: 19800,
    privatePrice: 29999,
    publicPrice: 14999,
  },
};

// ---------------------------------------------------------------------------
// Tarifs upload perso
// ---------------------------------------------------------------------------

export interface PrivateUploadTier {
  label: string;
  maxBytes: number;
  priceCents: number;
}

export const PRIVATE_UPLOAD_TIERS: PrivateUploadTier[] = [
  { label: "Jusqu'à 500 MB", maxBytes: 500 * 1024 * 1024, priceCents: 199 },
  { label: "500 MB à 2 GB", maxBytes: 2 * 1024 * 1024 * 1024, priceCents: 399 },
  { label: "2 GB à 5 GB", maxBytes: 5 * 1024 * 1024 * 1024, priceCents: 699 },
];

export interface PublicUploadTier {
  label: string;
  maxDurationMinutes: number;
  priceCents: number;
}

export const PUBLIC_UPLOAD_TIERS: PublicUploadTier[] = [
  { label: "Moins de 30 min", maxDurationMinutes: 30, priceCents: 499 },
  { label: "30 min à 1 h", maxDurationMinutes: 60, priceCents: 899 },
  { label: "Plus de 1 h", maxDurationMinutes: Infinity, priceCents: 1499 },
];

export function priceForPrivateUpload(fileSizeBytes: number): number | null {
  for (const tier of PRIVATE_UPLOAD_TIERS) {
    if (fileSizeBytes <= tier.maxBytes) return tier.priceCents;
  }
  return null;
}

export function priceForPublicUpload(durationMinutes: number): number {
  for (const tier of PUBLIC_UPLOAD_TIERS) {
    if (durationMinutes <= tier.maxDurationMinutes) return tier.priceCents;
  }
  return PUBLIC_UPLOAD_TIERS[PUBLIC_UPLOAD_TIERS.length - 1].priceCents;
}

// ---------------------------------------------------------------------------
// Boost visibilité
// ---------------------------------------------------------------------------

export interface BoostConfig {
  label: string;
  durationHours: number;
  priceCents: number;
}

export const BOOST_CONFIG: Record<BoostType, BoostConfig> = {
  homepage_24h: { label: "Homepage 24h", durationHours: 24, priceCents: 499 },
  category_7d: { label: "Catégorie 7 jours", durationHours: 24 * 7, priceCents: 1499 },
  badge_30d: { label: "Badge « du moment » 30j", durationHours: 24 * 30, priceCents: 3999 },
};

// ---------------------------------------------------------------------------
// CPM annonceurs
// ---------------------------------------------------------------------------

export const AD_CPM_CENTS: Record<AdFormat, number> = {
  preroll_15: 1000,
  midroll_30: 1500,
  banner: 400,
};

// ---------------------------------------------------------------------------
// Partage revenus créateurs
// ---------------------------------------------------------------------------

/**
 * Part du créateur selon complétion du visionnage (type Spotify).
 * Retourne une fraction 0..0.5 à multiplier par la valeur de la vue.
 */
export function getCreatorRevenueShare(pct: number): number {
  if (pct >= 100) return 0.5;
  if (pct >= 70) return 0.35;
  if (pct >= 30) return 0.15;
  return 0;
}

/**
 * Calcul du split entre créateur de la suite, créateur original, plateforme.
 * royaltyPercent : 0, 5, 10, 15 ou 20. Zéro = pas de royalty.
 */
export function calculatePayoutSplit(
  viewValue: number,
  pct: number,
  royaltyPercent: number,
): { sequelCreator: number; originalCreator: number; platform: number } {
  const share = getCreatorRevenueShare(pct);
  const totalCreator = viewValue * share;
  const rp = Math.max(0, Math.min(20, royaltyPercent));
  const royalty = (rp > 0) ? viewValue * (rp / 100) : 0;
  const sequelCreator = Math.max(0, totalCreator - royalty);
  return {
    sequelCreator,
    originalCreator: royalty,
    platform: viewValue - totalCreator,
  };
}

/**
 * Frais de traitement AiFlex sur payout (2%).
 * Retourne le montant net après frais en centimes.
 */
export const PAYOUT_FEE_PERCENT = 0.02;
export const PAYOUT_THRESHOLD_CENTS = 1000; // $10

export function netAfterFees(grossCents: number): number {
  return Math.round(grossCents * (1 - PAYOUT_FEE_PERCENT));
}

// ---------------------------------------------------------------------------
// Valeur d'une vue (abonnement / films vus dans le mois)
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_VALUE_CENTS: Record<UserPlan, number> = {
  free: 0,
  light: 499,
  premium: 999,
  family: 1499,
  light_yearly: Math.round(4999 / 12),     // $49.99/an
  premium_yearly: Math.round(9999 / 12),   // $99.99/an
};

/**
 * Calcul de la valeur d'un visionnage pour un user donné ce mois-ci.
 * viewValue = (prix abonnement mensuel) / (nb films vus ce mois)
 */
export function viewValueCents(plan: UserPlan, filmsWatchedThisMonth: number): number {
  const subValue = SUBSCRIPTION_VALUE_CENTS[plan] ?? 0;
  if (filmsWatchedThisMonth <= 0) return 0;
  return Math.round(subValue / filmsWatchedThisMonth);
}

// ---------------------------------------------------------------------------
// Agent : calcul heure de lancement
// ---------------------------------------------------------------------------

const BUFFER_MINUTES = 15;

/**
 * Calcule l'heure idéale de lancement de la génération pour qu'elle soit
 * prête à l'heure scheduledAt voulue par l'utilisateur.
 * Retourne null si scheduledAt est null (lancement immédiat).
 */
export function computeLaunchAt(format: FilmFormat, scheduledAt: Date | null): Date | null {
  if (!scheduledAt) return null;
  const cfg = FORMAT_CONFIG[format];
  const offsetMs = (cfg.estimatedGenerationMinutes + BUFFER_MINUTES) * 60 * 1000;
  const launchAt = new Date(scheduledAt.getTime() - offsetMs);
  const now = new Date();
  return launchAt < now ? now : launchAt;
}

// ---------------------------------------------------------------------------
// Style presets (B5.7)
// ---------------------------------------------------------------------------

export interface StylePreset {
  id: string;
  label: string;
  description: string;
  promptSuffix: string;
  suggestedGenres: string[];
}

export const STYLE_PRESETS: Record<string, StylePreset> = {
  pixar_kids: {
    id: "pixar_kids",
    label: "Pixar enfants",
    description: "Animation 3D colorée, personnages expressifs, univers chaleureux",
    promptSuffix:
      "Pixar-style 3D animation, bright saturated colors, friendly expressive characters, " +
      "soft warm lighting, family-friendly, cinematic framing.",
    suggestedGenres: ["famille", "aventure", "comédie"],
  },
  noir_cinema: {
    id: "noir_cinema",
    label: "Noir cinéma",
    description: "Film noir années 40, ombres dramatiques, noir & blanc",
    promptSuffix:
      "Film noir aesthetic, black and white, dramatic hard shadows, 1940s period setting, " +
      "rain-slicked streets, femme fatale lighting, venetian blinds shadow pattern.",
    suggestedGenres: ["thriller", "policier", "drame"],
  },
  anime_90s: {
    id: "anime_90s",
    label: "Anime années 90",
    description: "Animation cellulo, couleurs vives, style Ghibli/Akira",
    promptSuffix:
      "90s Japanese anime style, hand-drawn cel animation, vibrant saturated colors, " +
      "detailed backgrounds, dynamic poses, atmospheric lighting.",
    suggestedGenres: ["aventure", "science-fiction", "action"],
  },
  realistic_drama: {
    id: "realistic_drama",
    label: "Drame réaliste",
    description: "Rendu cinéma, lumière naturelle, faible profondeur de champ",
    promptSuffix:
      "Cinematic realistic drama, natural lighting, shallow depth of field, " +
      "handheld camera feel, muted naturalistic colors, emotionally grounded performances.",
    suggestedGenres: ["drame", "romance", "biopic"],
  },
  horror_80s: {
    id: "horror_80s",
    label: "Horreur années 80",
    description: "Atmosphère Carpenter / Romero, grain 16mm, néons",
    promptSuffix:
      "80s horror film aesthetic, heavy 16mm film grain, neon lighting, synth atmosphere, " +
      "practical effects feel, John Carpenter inspired.",
    suggestedGenres: ["horreur", "thriller", "mystère"],
  },
  cyberpunk_neon: {
    id: "cyberpunk_neon",
    label: "Cyberpunk néon",
    description: "Blade Runner, pluie, néons, mégalopoles",
    promptSuffix:
      "Cyberpunk neon aesthetic, rainy megacity streets, purple and teal neon lighting, " +
      "holograms, wet pavement reflections, Blade Runner 2049 inspired.",
    suggestedGenres: ["science-fiction", "thriller", "action"],
  },
  fantasy_epic: {
    id: "fantasy_epic",
    label: "Fantasy épique",
    description: "Seigneur des Anneaux, paysages majestueux, costumes médiévaux",
    promptSuffix:
      "Epic high-fantasy cinematography, sweeping landscapes, golden hour lighting, " +
      "intricate medieval costumes, practical sets, Peter Jackson inspired.",
    suggestedGenres: ["fantasy", "aventure", "action"],
  },
  documentary_verite: {
    id: "documentary_verite",
    label: "Documentaire vérité",
    description: "Caméra épaule, pas de musique, couleurs naturelles",
    promptSuffix:
      "Documentary cinema verité style, handheld shoulder-cam, naturalistic available light, " +
      "no saturation boost, observational framing.",
    suggestedGenres: ["documentaire", "drame"],
  },
  western_classic: {
    id: "western_classic",
    label: "Western classique",
    description: "Sergio Leone, plans larges désertiques, 2.35:1",
    promptSuffix:
      "Classic western cinematography, sun-scorched desert vistas, extreme wide shots, " +
      "2.35:1 cinemascope framing, Sergio Leone inspired, warm amber palette.",
    suggestedGenres: ["western", "action", "aventure"],
  },
  kids_storybook: {
    id: "kids_storybook",
    label: "Livre pour enfants",
    description: "Illustrations aquarelle animées, doux, Storybook",
    promptSuffix:
      "Illustrated storybook style, watercolor textures, soft pastel palette, " +
      "rounded character designs, gentle warm atmosphere, suitable for children under 7.",
    suggestedGenres: ["famille", "éducatif"],
  },
  music_video: {
    id: "music_video",
    label: "Clip musical",
    description: "Montage rapide, effets, couleurs saturées, rhythmé",
    promptSuffix:
      "Music video aesthetic, fast-cut rhythmic editing, saturated bold colors, " +
      "VFX accents, strobing lights on beats, dynamic camera movement.",
    suggestedGenres: ["clip", "expérimental"],
  },
  vintage_8mm: {
    id: "vintage_8mm",
    label: "Super 8 vintage",
    description: "Grain 8mm, couleurs délavées, nostalgie seventies",
    promptSuffix:
      "Vintage Super 8 film look, heavy grain, faded warm colors, light leaks, " +
      "70s nostalgic atmosphere, home-movie feel.",
    suggestedGenres: ["drame", "romance", "famille"],
  },
};

export const STYLE_PRESET_LIST: StylePreset[] = Object.values(STYLE_PRESETS);

// ---------------------------------------------------------------------------
// Configurations Creator Pro
// ---------------------------------------------------------------------------

export interface CreatorProPlan {
  id: string;
  label: string;
  priceCents: number;
  monthlyQuota: Partial<Record<FilmFormat, number>>;
}

export const CREATOR_PRO_PLANS: Record<string, CreatorProPlan> = {
  creator_pro_basic: {
    id: "creator_pro_basic",
    label: "Creator Pro Basic",
    priceCents: 2999,
    monthlyQuota: { episode_5: 2, episode_15: 1 },
  },
  creator_pro_standard: {
    id: "creator_pro_standard",
    label: "Creator Pro Standard",
    priceCents: 7999,
    monthlyQuota: { episode_15: 5, short_30: 1 },
  },
  creator_pro_premium: {
    id: "creator_pro_premium",
    label: "Creator Pro Premium",
    priceCents: 19999,
    monthlyQuota: { film_90: 1, episode_15: 3 },
  },
};
