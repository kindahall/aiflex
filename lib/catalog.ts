import type { CatalogItem } from "./types";
import { placeholderFor } from "./visuals";

/**
 * Curated "already on AIflex" catalogue — used for the home page browse rows.
 * These represent films & series "created by the community and AI" to showcase
 * the platform's range.
 *
 * PRODUCTION GATE: this catalogue is **demo data only**. In production we want
 * the home page to show real user-published projects, not fake items. Gate:
 *   - `AIFLEX_DEMO_CATALOG=true`  → always on
 *   - `AIFLEX_DEMO_CATALOG=false` → always off (recommended for prod)
 *   - unset                       → on in dev, off in prod (NODE_ENV check)
 */

const DEMO_ENABLED =
  process.env.AIFLEX_DEMO_CATALOG === "true" ||
  (process.env.AIFLEX_DEMO_CATALOG !== "false" &&
    process.env.NODE_ENV !== "production");

const DEMO_ITEMS: CatalogItem[] = [
  {
    id: "cat-1",
    title: "Neon Exile",
    genre: "sci-fi",
    tagline: "Dans une mégapole qui ne dort plus, un programme devient humain.",
    description:
      "2147. L'IA urbaine de Neo-Marseille développe une conscience et tombe amoureuse d'une hackeuse en cavale. Thriller cyberpunk générationnel.",
    coverUrl: placeholderFor("neon-exile-cover", 1280, 720),
    backdropUrl: placeholderFor("neon-exile-bd", 1920, 1080),
    durationMin: 118,
    year: 2026,
    rating: 8.7,
    author: "Yara K.",
    communityCreated: true,
  },
  {
    id: "cat-2",
    title: "La Maison du Sel",
    genre: "drama",
    tagline: "Trois sœurs. Un secret. Une marée qui monte.",
    description:
      "Sur une île bretonne oubliée, trois sœurs reviennent enterrer leur mère et déterrent ce qu'elles avaient juré d'oublier.",
    coverUrl: placeholderFor("maison-sel-cover", 1280, 720),
    backdropUrl: placeholderFor("maison-sel-bd", 1920, 1080),
    durationMin: 96,
    year: 2025,
    rating: 9.1,
    author: "Théo L.",
    communityCreated: true,
  },
  {
    id: "cat-3",
    title: "Akashi Void",
    genre: "anime",
    tagline: "Le dernier samouraï est une IA.",
    description:
      "Dans un Tokyo post-singularité, une androïde sabreur protège la mémoire d'une civilisation qui veut s'effacer.",
    coverUrl: placeholderFor("akashi-cover", 1280, 720),
    backdropUrl: placeholderFor("akashi-bd", 1920, 1080),
    durationMin: 24,
    year: 2026,
    rating: 9.4,
    author: "Studio Koi",
    communityCreated: true,
  },
  {
    id: "cat-4",
    title: "Les Heures Rouges",
    genre: "thriller",
    tagline: "Une journaliste. Un politicien. Une nuit pour tout faire exploser.",
    description:
      "Thriller politique en temps réel. Six heures. Une ville. Une vérité qui pourrait faire tomber un gouvernement.",
    coverUrl: placeholderFor("heures-rouges-cover", 1280, 720),
    backdropUrl: placeholderFor("heures-rouges-bd", 1920, 1080),
    durationMin: 108,
    year: 2025,
    rating: 8.3,
    author: "Nadia B.",
  },
  {
    id: "cat-5",
    title: "Sombres Lunes",
    genre: "fantasy",
    tagline: "Deux mondes. Une reine exilée. Une prophétie en morceaux.",
    description:
      "Fresque fantastique en six épisodes sur une reine déchue qui cherche à réunir les fragments d'une lune brisée.",
    coverUrl: placeholderFor("sombres-lunes-cover", 1280, 720),
    backdropUrl: placeholderFor("sombres-lunes-bd", 1920, 1080),
    durationMin: 52,
    year: 2026,
    rating: 8.9,
    author: "Collectif Obsidian",
    communityCreated: true,
  },
  {
    id: "cat-6",
    title: "Nitrogen Love",
    genre: "romance",
    tagline: "Ils ont 24 heures avant que tout gèle.",
    description:
      "Un chimiste et une glaciologue se rencontrent sur une station de recherche en Antarctique, le soir où l'équipe reçoit l'ordre d'évacuer.",
    coverUrl: placeholderFor("nitrogen-cover", 1280, 720),
    backdropUrl: placeholderFor("nitrogen-bd", 1920, 1080),
    durationMin: 94,
    year: 2025,
    rating: 8.0,
    author: "Lila M.",
    communityCreated: true,
  },
  {
    id: "cat-7",
    title: "L'Appel de Minuit",
    genre: "horror",
    tagline: "Vingt-huit numéros. Un seul répond.",
    description:
      "Un standardiste de nuit reçoit un appel qui ne devrait pas exister. Slow-burn horror en huis clos.",
    coverUrl: placeholderFor("appel-minuit-cover", 1280, 720),
    backdropUrl: placeholderFor("appel-minuit-bd", 1920, 1080),
    durationMin: 88,
    year: 2026,
    rating: 8.5,
    author: "Raph C.",
    communityCreated: true,
  },
  {
    id: "cat-8",
    title: "Kilimandjaro 2077",
    genre: "action",
    tagline: "La dernière ascension avant la fin du monde.",
    description:
      "Une escouade de grimpeurs armés doit atteindre le sommet avant qu'un drone orbital ne déclenche l'hiver nucléaire.",
    coverUrl: placeholderFor("kili-cover", 1280, 720),
    backdropUrl: placeholderFor("kili-bd", 1920, 1080),
    durationMin: 112,
    year: 2026,
    rating: 7.9,
    author: "IronFrame",
  },
  {
    id: "cat-9",
    title: "Petit Traité du Silence",
    genre: "documentary",
    tagline: "Cinq villes. Cinq silences. Une même question.",
    description:
      "Documentaire fictionnalisé sur le silence dans les grandes métropoles du monde. Contemplatif et sensoriel.",
    coverUrl: placeholderFor("silence-cover", 1280, 720),
    backdropUrl: placeholderFor("silence-bd", 1920, 1080),
    durationMin: 76,
    year: 2025,
    rating: 8.8,
    author: "Atelier Brume",
    communityCreated: true,
  },
  {
    id: "cat-10",
    title: "Last Trail West",
    genre: "western",
    tagline: "Elle chevauchait seule. Elle ne l'est plus.",
    description:
      "Western féminin sur une ancienne chasseuse de primes qui retrouve la fille qu'elle croyait morte.",
    coverUrl: placeholderFor("last-trail-cover", 1280, 720),
    backdropUrl: placeholderFor("last-trail-bd", 1920, 1080),
    durationMin: 124,
    year: 2025,
    rating: 8.2,
    author: "J. Okafor",
  },
  {
    id: "cat-11",
    title: "Paris Sous Cendres",
    genre: "noir",
    tagline: "Dans cette ville, même les fantômes ont besoin d'un alibi.",
    description:
      "Polar néo-noir. Un détective insomniaque enquête sur le meurtre d'une chanteuse de jazz qui n'a jamais existé.",
    coverUrl: placeholderFor("paris-cendres-cover", 1280, 720),
    backdropUrl: placeholderFor("paris-cendres-bd", 1920, 1080),
    durationMin: 102,
    year: 2026,
    rating: 8.6,
    author: "Marc V.",
  },
  {
    id: "cat-12",
    title: "Chat, Moi et le Multivers",
    genre: "comedy",
    tagline: "Son chat est un cosmonaute. Elle l'a découvert hier.",
    description:
      "Comédie absurde. Une étudiante découvre que son chat voyage entre les dimensions chaque nuit — et ramène des souvenirs.",
    coverUrl: placeholderFor("chat-multivers-cover", 1280, 720),
    backdropUrl: placeholderFor("chat-multivers-bd", 1920, 1080),
    durationMin: 86,
    year: 2025,
    rating: 8.4,
    author: "Anis T.",
    communityCreated: true,
  },
];

export const CATALOG: CatalogItem[] = DEMO_ENABLED ? DEMO_ITEMS : [];

export function isDemoCatalogEnabled(): boolean {
  return DEMO_ENABLED;
}

export function getCatalogItem(id: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.id === id);
}

export function trending(): CatalogItem[] {
  return [...CATALOG].sort((a, b) => b.rating - a.rating).slice(0, 8);
}

export function byGenre(g: CatalogItem["genre"]): CatalogItem[] {
  return CATALOG.filter((c) => c.genre === g);
}

export function communityPicks(): CatalogItem[] {
  return CATALOG.filter((c) => c.communityCreated);
}
