import Anthropic from "@anthropic-ai/sdk";
import { MASTER_SYSTEM_PROMPT } from "./prompts";
import { getSettings } from "./server-db";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY manquant. Copie .env.local.example en .env.local et ajoute ta clé."
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Call Claude with a single user message. The master system prompt is cached
 * so every downstream call (concept → scenario → scenes) reads from cache.
 *
 * The exact model used is read from the platform settings store, so the admin
 * can swap Opus / Sonnet / Haiku from the dashboard without a redeploy.
 */
export async function callClaudeJSON(userPrompt: string): Promise<string> {
  const client = getAnthropic();
  const settings = await getSettings();
  const response = await client.messages.create({
    model: settings.narrativeModel,
    max_tokens: 16000,
    // Stable system prompt — cached across every AIflex request
    system: [
      {
        type: "text",
        text: MASTER_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return text;
}

/**
 * Parse a JSON blob returned by Claude. Claude is instructed to return pure
 * JSON, but we defensively strip any stray markdown fencing just in case.
 */
export function parseClaudeJSON<T>(raw: string): T {
  let clean = raw.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  // Sometimes models wrap with stray text — extract the outermost {...}
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    clean = clean.slice(first, last + 1);
  }
  return JSON.parse(clean) as T;
}
