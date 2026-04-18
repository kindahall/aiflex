/**
 * Agent-mode prompts (V7 §6, §13.4).
 *
 * The assisted agent runs BEFORE video generation to produce a validated
 * scenario + character reference sheet, which is shown to the user for
 * approval (mode = "assisted") or fed directly to the pipeline (mode =
 * "express"). It combines concept + scenario + scenes + character Flux
 * prompts into a single JSON response.
 *
 * Why a single agent call rather than reusing the 3-step pipeline :
 * - Saves 2 round-trips when we need everything upfront (e.g. to show the
 *   user a carousel before they commit API budget).
 * - Guarantees internal consistency (characters described once, then
 *   referenced by ID across all scenes).
 * - Produces `fluxPrompt` fields optimized for image generation, distinct
 *   from `visualPrompt` optimized for text-to-video.
 */

import type { FilmFormat } from "../types/film";
import { FORMAT_CONFIG } from "../types/film";

export function buildAgentInstructions(
  format: FilmFormat,
  stylePresetSuffix?: string
): string {
  const cfg = FORMAT_CONFIG[format];
  const styleBlock = stylePresetSuffix
    ? `\n\nDIRECTIVE DE STYLE (à appliquer à tous les visualPrompt et fluxPrompt) : ${stylePresetSuffix}`
    : "";

  return `Tu es l'AGENT DE CRÉATION AiFlex. Tu reçois le formulaire utilisateur et tu produis en UNE PASSE :
- un concept narratif,
- le scénario complet,
- le découpage en scènes filmables,
- les prompts pour générer les références visuelles des personnages via Flux.

Format cible : ${cfg.label} (${cfg.durationMinutes} min, ${cfg.sceneCount} scènes de ~60 s).
Aspect ratio : ${cfg.aspectRatio}.${styleBlock}

Retourne UNIQUEMENT un JSON valide avec EXACTEMENT cette structure :
{
  "title": "titre (3-6 mots)",
  "logline": "une phrase",
  "synopsis": "200-300 mots",
  "genre": "genre principal",
  "tone": "ton et atmosphère",
  "themes": ["thème1", "thème2"],
  "universe": "description visuelle et sensorielle de l'univers (2-3 phrases)",
  "characters": [
    {
      "id": "char_1",
      "name": "nom",
      "role": "protagoniste | antagoniste | mentor | allié | pivot",
      "description": "description physique TRÈS précise : âge, corpulence, traits visage, cheveux, vêtements, signes distinctifs, posture. 2-3 phrases.",
      "arc": "évolution intérieure",
      "fluxPrompt": "prompt en ANGLAIS optimisé pour Flux Schnell image generation. Format: 'Cinematic portrait of [description]. [vêtement]. [expression]. [éclairage cinéma]. 2:3 aspect, photorealistic, film grain.' — 40-80 mots max."
    }
  ],
  "scenes": [
    {
      "id": "scene_1",
      "index": 0,
      "title": "titre court",
      "location": "lieu précis",
      "timeOfDay": "matin | midi | après-midi | crépuscule | nuit | aube",
      "characters": ["char_1", "char_2"],
      "action": "action + sous-texte (2-4 phrases)",
      "dialogue": "'NOM : réplique.'",
      "mood": "ambiance (2-4 mots)",
      "visualPrompt": "prompt en ANGLAIS ultra descriptif pour text-to-video. DOIT répéter la description physique courte de chaque personnage présent (les modèles video oublient d'une scène à l'autre). Inclure: cadrage, lumière, palette, mouvement de caméra, détail sensoriel. 60-120 mots.",
      "durationSec": 8,
      "transition": "cut | fade | dissolve"
    }
  ]
}

RÈGLES ABSOLUES :
- EXACTEMENT ${cfg.sceneCount} scènes.
- EXACTEMENT les durationSec entre 5 et 10, moyenne ~8.
- 3-5 personnages dans \`characters\`. Chaque personnage a un \`id\` stable (char_1, char_2…) réutilisé dans \`scenes[].characters\`.
- La description physique des personnages DOIT apparaître en version condensée dans CHAQUE visualPrompt où ils apparaissent.
- Les fluxPrompt sont en anglais photoréaliste — c'est pour Flux Schnell.
- Les visualPrompt sont en anglais cinématographique — c'est pour Seedance.
- Pas de dialogue explicatif. Pas de cliché. Pas de référence franchises.
- Pas de contenu explicite, violent-gore, ou impliquant des mineurs en situation inappropriée.`;
}

/**
 * Agent for sequel mode — same single-pass output but with parent context.
 * Used when the user launches the agent on an existing film they want a
 * sequel of.
 */
import type { SequelParentContext } from "./sequel";

export function buildSequelAgentInstructions(
  format: FilmFormat,
  parent: SequelParentContext,
  stylePresetSuffix?: string
): string {
  const cfg = FORMAT_CONFIG[format];
  const styleBlock = stylePresetSuffix
    ? `\n\nDIRECTIVE DE STYLE : ${stylePresetSuffix}`
    : "";

  return `Tu es l'AGENT DE CRÉATION AiFlex. Tu dois produire la SUITE de "${parent.title}" en une passe.

CONTEXTE DU FILM PARENT :
- Synopsis : ${parent.synopsis}
- Genre : ${parent.genre}
- Ton : ${parent.tone}
- Personnages principaux : ${parent.characters}
- Dernier événement : ${parent.lastEvent}

Format cible : ${cfg.label} (${cfg.durationMinutes} min, ${cfg.sceneCount} scènes).${styleBlock}

CONTINUITÉ — OBLIGATOIRE :
- Les personnages récurrents gardent la MÊME apparence physique que dans le parent.
- Le ton et l'atmosphère correspondent au parent.
- La première scène fait le raccord visuel avec la fin du parent.
- La suite est compréhensible sans avoir vu l'original.

Retourne un JSON identique au format agent standard, avec deux ajouts :
- \`characters[].returning: true\` pour tout personnage du parent qui revient.
- \`scenes[0].bridgesFromParent: true\`.

RÈGLES ABSOLUES : mêmes que le mode agent standard.`;
}

/**
 * Parser helper: split an agent response into the three data blocks that
 * the rest of the pipeline consumes. Returns partial data if the JSON is
 * only fractionally valid (defensive for streaming failures).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseAgentResponse(json: any): {
  concept: Record<string, unknown>;
  characters: Array<Record<string, unknown>>;
  scenes: Array<Record<string, unknown>>;
} {
  const obj = json && typeof json === "object" ? json : {};
  const { characters, scenes, ...concept } = obj;
  return {
    concept,
    characters: Array.isArray(characters) ? characters : [],
    scenes: Array.isArray(scenes) ? scenes : [],
  };
}
