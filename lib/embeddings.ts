import "server-only";
import OpenAI from "openai";

/**
 * Text embeddings for pgvector-powered recommendations (V8 §B4.5).
 *
 * Provider: OpenAI `text-embedding-3-small` (1536 dims, ~$0.02 per 1M tokens).
 * Cached per API key instance just like lib/ai-client.ts.
 *
 * Store the output directly on `Project.embedding` (vector(1536) in
 * schema.prisma). The query side is in lib/recommendations-vec.ts.
 */

const MODEL = "text-embedding-3-small";
const DIMS = 1536;

let _client: { key: string; client: OpenAI } | null = null;

function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY || "";
  if (!key) return null;
  if (_client?.key === key) return _client.client;
  const client = new OpenAI({ apiKey: key });
  _client = { key, client };
  return client;
}

/**
 * Embed a single text blob. Returns null if no OpenAI key is configured —
 * the reco pipeline falls back to the heuristic scoring (lib/recommendations.ts).
 */
export async function embedText(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;
  const resp = await client.embeddings.create({
    model: MODEL,
    input: text.slice(0, 8000), // token cap protection
  });
  const vec = resp.data[0]?.embedding;
  if (!vec || vec.length !== DIMS) return null;
  return vec;
}

/**
 * Build the canonical text blob to embed for a Project. Kept in one place
 * so backfills and live writes use the same textual representation —
 * otherwise nearest-neighbor quality drifts over time.
 */
export function projectEmbeddingText(project: {
  title?: string | null;
  synopsis?: string | null;
  genre?: string | null;
  concept?: unknown;
}): string {
  const parts: string[] = [];
  if (project.title) parts.push(project.title);
  if (project.genre) parts.push(`Genre: ${project.genre}`);
  if (project.synopsis) parts.push(project.synopsis);
  const concept = project.concept as
    | {
        logline?: string;
        themes?: string[];
        tone?: string;
        universe?: string;
      }
    | null
    | undefined;
  if (concept?.logline) parts.push(concept.logline);
  if (concept?.themes?.length) parts.push(`Themes: ${concept.themes.join(", ")}`);
  if (concept?.tone) parts.push(`Tone: ${concept.tone}`);
  if (concept?.universe) parts.push(concept.universe);
  return parts.join("\n\n");
}

export { DIMS as EMBEDDING_DIMS };
