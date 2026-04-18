/**
 * Series generation prompts (V7 §5, §13.2).
 *
 * A series is generated as ONE Claude call producing N episode skeletons at
 * once — this is what guarantees cross-episode continuity (same characters,
 * progressive plot, cliffhangers that actually link). Per-episode scene
 * generation is then done independently.
 */

import type { FilmFormat } from "../types/film";
import { FORMAT_CONFIG } from "../types/film";

export function buildSeriesConceptInstructions(
  episodeCount: number,
  format: FilmFormat
): string {
  const cfg = FORMAT_CONFIG[format];
  return `Enrichis l'idée de l'utilisateur en un CONCEPT DE SÉRIE de ${episodeCount} épisodes.

Chaque épisode durera environ ${cfg.durationMinutes} minutes.

Retourne un JSON avec EXACTEMENT cette structure :
{
  "seriesTitle": "titre de la série (3-6 mots)",
  "seriesLogline": "une phrase résumant l'arc global",
  "seriesSynopsis": "résumé de 200-300 mots sur l'arc narratif complet de la saison",
  "themes": ["thème1", "thème2", "thème3"],
  "tone": "ton et atmosphère",
  "universe": "description visuelle et sensorielle de l'univers",
  "characters": [
    {
      "name": "nom",
      "role": "protagoniste | antagoniste | mentor | allié | pivot",
      "description": "description physique TRÈS précise (âge, corpulence, traits, vêtements récurrents, signes distinctifs). Elle sera répétée dans chaque épisode.",
      "arc": "transformation sur toute la saison"
    }
  ],
  "episodes": [
    {
      "episodeNumber": 1,
      "title": "titre de l'épisode",
      "logline": "une phrase",
      "summary": "résumé 60-100 mots",
      "cliffhanger": "description explicite du cliffhanger final de l'épisode",
      "newCharacters": ["nom3", "nom4"]
    }
  ]
}

Règles CRITIQUES :
- La série DOIT former un arc cohérent sur ${episodeCount} épisodes.
- Chaque épisode (sauf éventuellement le dernier) se termine par un CLIFFHANGER fort et inattendu qui donne envie du suivant.
- Les personnages récurrents ont la MÊME description physique dans tous les épisodes.
- La narration progresse logiquement : chaque cliffhanger doit être résolu (ou complexifié) dans l'épisode suivant.
- 3-5 personnages récurrents + 1-3 nouveaux par épisode autorisés.`;
}

/**
 * Per-episode scenario generation. Receives the series concept (above) plus
 * the target episode index, and returns a full 3-act scenario for that
 * episode only. Called N times after the series concept step.
 */
export function buildEpisodeScenarioInstructions(
  episodeNumber: number,
  totalEpisodes: number
): string {
  return `À partir du concept de série fourni, écris le SCÉNARIO COMPLET de l'épisode ${episodeNumber}/${totalEpisodes}.

Retourne un JSON avec EXACTEMENT cette structure :
{
  "acts": [
    { "number": 1, "title": "...", "summary": "...", "beats": ["..."] }
  ],
  "fullOutline": "résumé 250-400 mots qui raconte tout l'épisode du début au cliffhanger",
  "cliffhanger": "description précise du cliffhanger final (DOIT correspondre à celui du concept de série)"
}

Règles :
- 3 actes pour un épisode de 5-15 min.
- 3 à 5 beats par acte.
- Le fullOutline DOIT se terminer sur le cliffhanger annoncé dans le concept de série.
- Si ce n'est pas le premier épisode : le premier acte résout brièvement le cliffhanger précédent.
- Si ce n'est pas le dernier épisode : le dernier acte installe le nouveau cliffhanger.`;
}

export function buildEpisodeScenesInstructions(
  episodeNumber: number,
  sceneCount: number
): string {
  return `À partir du scénario de l'épisode ${episodeNumber}, découpe-le en ${sceneCount} scènes filmables.

Retourne un JSON avec EXACTEMENT cette structure :
{
  "scenes": [
    {
      "index": 0,
      "title": "titre court",
      "location": "lieu précis",
      "timeOfDay": "matin | midi | après-midi | crépuscule | nuit | aube",
      "characters": ["nom1"],
      "action": "action + sous-texte (2-4 phrases)",
      "dialogue": "'NOM : réplique.'",
      "mood": "ambiance (2-4 mots)",
      "visualPrompt": "prompt en ANGLAIS ultra descriptif. Répéter systématiquement la description physique des personnages récurrents à chaque scène.",
      "durationSec": 8
    }
  ]
}

Règles :
- EXACTEMENT ${sceneCount} scènes.
- La dernière scène (\`index: ${sceneCount - 1}\`) est le cliffhanger final de l'épisode.
- durationSec entre 5 et 10 secondes.
- visualPrompt en ANGLAIS, toujours répéter la description physique des personnages (les modèles text-to-video oublient entre scènes).`;
}
