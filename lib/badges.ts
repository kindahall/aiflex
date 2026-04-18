/**
 * Creator badge system. Badges are computed on-the-fly from the user's
 * stats — no persistent state needed. The function takes aggregate
 * numbers and returns the list of earned badges.
 *
 * This keeps badges honest and self-maintaining: if a film is unpublished,
 * the badge might disappear — that's OK for a prototype. A production
 * system would snapshot the grant and never revoke.
 */

export interface Badge {
  id: string;
  icon: string;
  label: string;
  description: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
}

export interface CreatorStats {
  publishedFilms: number;
  totalLikes: number;
  totalViews: number;
  totalScenes: number;
  totalVideos: number;
  totalComments: number;
  remixCount: number;
}

const ALL_BADGES: Array<Badge & { test: (s: CreatorStats) => boolean }> = [
  // --- Publishing milestones ---
  {
    id: "first-film",
    icon: "🎬",
    label: "Premier film",
    description: "Publie ton premier film sur AIflex.",
    tier: "bronze",
    test: (s) => s.publishedFilms >= 1,
  },
  {
    id: "prolific-5",
    icon: "🎥",
    label: "Réalisateur prolifique",
    description: "5 films publiés.",
    tier: "silver",
    test: (s) => s.publishedFilms >= 5,
  },
  {
    id: "studio-master",
    icon: "🏛",
    label: "Maître du studio",
    description: "10 films publiés — tu es un vrai studio.",
    tier: "gold",
    test: (s) => s.publishedFilms >= 10,
  },
  // --- Engagement reçu ---
  {
    id: "first-like",
    icon: "♥",
    label: "Premier like",
    description: "Quelqu'un a aimé ton travail.",
    tier: "bronze",
    test: (s) => s.totalLikes >= 1,
  },
  {
    id: "crowd-fav",
    icon: "🌟",
    label: "Favori du public",
    description: "50 likes cumulés sur tes films.",
    tier: "silver",
    test: (s) => s.totalLikes >= 50,
  },
  {
    id: "viral",
    icon: "🔥",
    label: "Viral",
    description: "100 vues cumulées.",
    tier: "bronze",
    test: (s) => s.totalViews >= 100,
  },
  {
    id: "blockbuster",
    icon: "💎",
    label: "Blockbuster",
    description: "1 000 vues cumulées — un vrai succès.",
    tier: "gold",
    test: (s) => s.totalViews >= 1000,
  },
  // --- Production ---
  {
    id: "scene-writer-50",
    icon: "✍",
    label: "Scénariste",
    description: "50 scènes écrites par l'IA.",
    tier: "bronze",
    test: (s) => s.totalScenes >= 50,
  },
  {
    id: "videographer-20",
    icon: "📹",
    label: "Vidéaste IA",
    description: "20 vidéos générées par Seedance.",
    tier: "silver",
    test: (s) => s.totalVideos >= 20,
  },
  // --- Community ---
  {
    id: "first-comment",
    icon: "💬",
    label: "Critique",
    description: "Ton premier commentaire reçu sur un film.",
    tier: "bronze",
    test: (s) => s.totalComments >= 1,
  },
  {
    id: "remixed",
    icon: "↻",
    label: "Source d'inspiration",
    description: "Un de tes films a été remixé.",
    tier: "silver",
    test: (s) => s.remixCount >= 1,
  },
  {
    id: "legend",
    icon: "👑",
    label: "Légende AIflex",
    description: "10+ films, 100+ likes, 1 000+ vues.",
    tier: "platinum",
    test: (s) =>
      s.publishedFilms >= 10 &&
      s.totalLikes >= 100 &&
      s.totalViews >= 1000,
  },
];

const TIER_ORDER: Record<Badge["tier"], number> = {
  platinum: 0,
  gold: 1,
  silver: 2,
  bronze: 3,
};

/**
 * Compute earned badges from aggregate stats. Returns badges sorted by
 * tier (platinum first), then by id for stability.
 */
export function computeBadges(stats: CreatorStats): Badge[] {
  return ALL_BADGES.filter((b) => b.test(stats))
    .map(({ test: _, ...badge }) => badge)
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
}

export const TIER_COLORS: Record<Badge["tier"], string> = {
  bronze: "from-orange-700/20 to-orange-600/10 border-orange-600/30 text-orange-400",
  silver: "from-gray-300/20 to-gray-200/10 border-gray-400/30 text-gray-300",
  gold: "from-yellow-500/20 to-yellow-400/10 border-yellow-500/30 text-yellow-400",
  platinum: "from-purple-500/20 to-pink-400/10 border-purple-400/30 text-purple-300",
};
