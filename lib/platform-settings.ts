/**
 * Platform-wide configuration — models, API keys, site content.
 *
 * Everything here is editable from the admin dashboard without touching
 * .env.local or redeploying. API keys in DB take priority over env vars.
 */

// --- Site content (CMS) ------------------------------------------------

export interface SiteContent {
  // Hero
  heroBadge: string;
  // CTA block on homepage
  ctaBadge: string;
  ctaTitle: string;
  ctaDescription: string;
  ctaPrimaryLabel: string;
  ctaSecondaryLabel: string;
  // Studio entry page
  studioEyebrow: string;
  studioTitle: string;
  studioDescription: string;
  // Meta
  siteTitle: string;
  siteDescription: string;
}

export const DEFAULT_SITE_CONTENT: SiteContent = {
  heroBadge: "Créé par la communauté IA",
  ctaBadge: "Studio IA — Nouveau",
  ctaTitle: "Transforme ton idée en film.",
  ctaDescription:
    "Décris une histoire en quelques phrases. AIflex construit le concept, écrit le scénario, découpe les scènes et génère chaque plan vidéo automatiquement grâce à l'IA.",
  ctaPrimaryLabel: "Lancer le studio →",
  ctaSecondaryLabel: "Créer un compte",
  studioEyebrow: "Studio IA AIflex",
  studioTitle: "Donne-nous une idée.",
  studioDescription:
    "Écris une idée — même vague. Notre IA construit le concept, le scénario et les scènes, puis génère chaque plan en vidéo automatiquement.",
  siteTitle: "AIflex — Streame. Crée. Deviens réalisateur.",
  siteDescription:
    "La première plateforme de streaming où chaque spectateur peut devenir créateur. Transforme une idée en film entier grâce à l'intelligence artificielle.",
};

// --- API keys -----------------------------------------------------------

export interface ApiKeysConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  falApiKey?: string;
}

// --- Main settings ------------------------------------------------------

export interface PlatformSettings {
  narrativeModel: string;
  /** Reasoning level for the narrative model (GPT-5.4 supports none→xhigh). */
  reasoningLevel: string;
  videoModel: string;
  allowSignups: boolean;
  maxScenesPerProject: number;
  monthlyVideoQuota: number;
  apiKeys: ApiKeysConfig;
  siteContent: SiteContent;
  /** TTS model identifier (default: "openai-tts-1-hd"). */
  ttsModel: string;
  /** Default TTS voice (default: "nova"). */
  defaultVoice: string;
  /** ID of the project featured on the landing page hero. */
  featuredProjectId?: string;
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  narrativeModel: "gpt-5.4",
  reasoningLevel: "medium",
  videoModel: "fal-ai/bytedance/seedance/v2/pro/text-to-video",
  allowSignups: true,
  maxScenesPerProject: 24,
  monthlyVideoQuota: 30,
  apiKeys: {},
  siteContent: { ...DEFAULT_SITE_CONTENT },
  ttsModel: "openai-tts-1-hd",
  defaultVoice: "nova",
};

// --- Model options ------------------------------------------------------

export type NarrativeProvider = "anthropic" | "openai";

export interface NarrativeModelOption {
  id: string;
  label: string;
  provider: NarrativeProvider;
  note: string;
  recommended?: boolean;
}

export interface VideoModelOption {
  id: string;
  label: string;
  provider: "fal.ai";
  note: string;
  recommended?: boolean;
}

export const NARRATIVE_MODELS: NarrativeModelOption[] = [
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    provider: "openai",
    note: "Dernière génération OpenAI — narration puissante, créativité maximale. Par défaut.",
    recommended: true,
  },
  {
    id: "claude-opus-4-6",
    label: "Claude Opus 4.6",
    provider: "anthropic",
    note: "Le plus intelligent d'Anthropic — structure narrative forte, personnages nuancés.",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    note: "Équilibre vitesse / qualité — bon pour production en volume.",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    note: "Le plus rapide et économique — idéal pour drafts et itérations rapides.",
  },
];

export const VIDEO_MODELS: VideoModelOption[] = [
  {
    id: "fal-ai/bytedance/seedance/v2/pro/text-to-video",
    label: "Seedance 2 Pro (ByteDance)",
    provider: "fal.ai",
    note: "Dernière génération — cohérence temporelle et photoréalisme de pointe. Par défaut.",
    recommended: true,
  },
  {
    id: "fal-ai/bytedance/seedance/v1/pro/text-to-video",
    label: "Seedance 1 Pro (ByteDance)",
    provider: "fal.ai",
    note: "Version précédente — plus rapide, moins chère.",
  },
  {
    id: "fal-ai/veo3/text-to-video",
    label: "Veo 3 (Google)",
    provider: "fal.ai",
    note: "Réalisme cinématographique Google DeepMind — excellent pour plans live-action.",
  },
  {
    id: "fal-ai/kling-video/v2/master/text-to-video",
    label: "Kling 2 Master (Kuaishou)",
    provider: "fal.ai",
    note: "Très bon sur les plans longs et les mouvements complexes.",
  },
  {
    id: "fal-ai/minimax/hailuo-02/pro/text-to-video",
    label: "Hailuo 02 Pro (MiniMax)",
    provider: "fal.ai",
    note: "Fluidité de mouvement et stylisation — fort sur l'anime et l'illustratif.",
  },
  {
    id: "fal-ai/luma-dream-machine",
    label: "Dream Machine (Luma)",
    provider: "fal.ai",
    note: "Esthétique onirique — fort sur les ambiances et plans courts.",
  },
  {
    id: "fal-ai/wan-ai/wan2.6/1080p/text-to-video",
    label: "Wan 2.6 1080p",
    provider: "fal.ai",
    note: "Wan 2.6 — modèle chinois haute qualité, fort en cohérence temporelle et détails.",
  },
  {
    id: "fal-ai/wan-ai/wan2.6/720p/text-to-video",
    label: "Wan 2.6 720p",
    provider: "fal.ai",
    note: "Wan 2.6 en 720p — plus rapide et économique.",
  },
  {
    id: "fal-ai/lightricks/ltx-video/v2.3",
    label: "LTX Video 2.3 (Lightricks)",
    provider: "fal.ai",
    note: "LTX 2.3 — génération ultra-rapide, bon ratio qualité/vitesse, fort en mouvements naturels.",
  },
];

export function findNarrativeModel(id: string): NarrativeModelOption | undefined {
  return NARRATIVE_MODELS.find((m) => m.id === id);
}

export function findVideoModel(id: string): VideoModelOption | undefined {
  return VIDEO_MODELS.find((m) => m.id === id);
}

// --- TTS voice options ---------------------------------------------------

export interface TTSVoiceOption {
  id: string;
  label: string;
  note: string;
}

export const TTS_VOICES: TTSVoiceOption[] = [
  { id: "alloy", label: "Alloy", note: "Neutre, polyvalent" },
  { id: "echo", label: "Echo", note: "Masculin, grave" },
  { id: "fable", label: "Fable", note: "Narrateur, expressif" },
  { id: "onyx", label: "Onyx", note: "Masculin, profond" },
  { id: "nova", label: "Nova", note: "Féminin, chaleureux" },
  { id: "shimmer", label: "Shimmer", note: "Féminin, clair" },
];

/** Mask an API key for display: show only last 4 chars. */
export function maskKey(key: string | undefined): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `••••••••${key.slice(-4)}`;
}
