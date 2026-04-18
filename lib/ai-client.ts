import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { MASTER_SYSTEM_PROMPT } from "./prompts";
import { getSettings } from "./server-db";

/**
 * Unified AI client.
 *
 * Provider boundaries:
 *   - Anthropic Claude → narrative generation, moderation, agent orchestration
 *   - OpenAI           → Whisper ASR, embeddings, TTS (Anthropic has no equivalent)
 *
 * Model routing rule for narrative:
 *   - model starts with "claude-"              → Anthropic
 *   - model starts with "gpt-" / "o1/3/4"      → OpenAI
 *
 * The admin can switch between narrative providers at any time from /admin/settings
 * without a redeploy (model ID only). API keys are read exclusively from env vars.
 */

// --- Singletons ---

// Clients are keyed by API key so they auto-refresh if the env var rotates.
let _anthropic: { key: string; client: Anthropic } | null = null;
let _openai: { key: string; client: OpenAI } | null = null;

function getAnthropicClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY || "";
  if (!key) throw new Error("ANTHROPIC_API_KEY manquante — configure-la dans .env.local");
  if (_anthropic?.key === key) return _anthropic.client;
  const client = new Anthropic({ apiKey: key });
  _anthropic = { key, client };
  return client;
}

function getOpenAIClient(): OpenAI {
  const key = process.env.OPENAI_API_KEY || "";
  if (!key) throw new Error("OPENAI_API_KEY manquante — configure-la dans .env.local");
  if (_openai?.key === key) return _openai.client;
  const client = new OpenAI({ apiKey: key });
  _openai = { key, client };
  return client;
}

export function detectProvider(modelId: string): "anthropic" | "openai" {
  if (
    modelId.startsWith("gpt-") ||
    modelId.startsWith("o3") ||
    modelId.startsWith("o4") ||
    modelId.startsWith("o1")
  ) {
    return "openai";
  }
  return "anthropic";
}

// --- Unified call ---

/**
 * Call the narrative AI model with a single user message. The master
 * system prompt is included for context. Returns the raw text response.
 *
 * The model is read from platform settings, so the admin can swap
 * between Claude and GPT from the dashboard.
 */
export async function callNarrativeJSON(userPrompt: string): Promise<string> {
  const settings = await getSettings();
  const model = settings.narrativeModel;
  const provider = detectProvider(model);

  if (provider === "openai") {
    return callOpenAI(model, userPrompt);
  }
  return callAnthropic(model, userPrompt);
}

async function callAnthropic(model: string, userPrompt: string): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system: [
      {
        type: "text",
        text: MASTER_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

async function callOpenAI(model: string, userPrompt: string): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model,
    max_tokens: 16000,
    messages: [
      { role: "system", content: MASTER_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

// --- Moderation helper ---

/**
 * Quick moderation call using the cheapest available model. Prefers
 * Claude Haiku if ANTHROPIC_API_KEY is set, falls back to GPT-4.1-mini
 * if only OPENAI_API_KEY is available.
 */
export async function callModerationJSON(
  systemPrompt: string,
  content: string
): Promise<string> {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

  if (hasAnthropic) {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content }],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }

  if (hasOpenAI) {
    const client = getOpenAIClient();
    const res = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      max_tokens: 200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
    });
    return res.choices[0]?.message?.content?.trim() || "";
  }

  throw new Error("Aucune clé API IA configurée — définis ANTHROPIC_API_KEY ou OPENAI_API_KEY dans .env.local");
}

// --- JSON parser (same as before, works for both providers) ---

export function parseAIJSON<T>(raw: string): T {
  let clean = raw.trim();
  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    clean = clean.slice(first, last + 1);
  }
  return JSON.parse(clean) as T;
}

// --- Backwards compat exports for existing code ---
// These re-export the old names so nothing breaks during transition.

export const getAnthropic = getAnthropicClient;
export const callClaudeJSON = callNarrativeJSON;
export const parseClaudeJSON = parseAIJSON;
