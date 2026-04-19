import "server-only";

/**
 * AI cost ledger. Wraps any outbound call to a paid provider and writes
 * a row to AiCostEntry so we can monitor spend per provider / per user
 * / per operation without polling each vendor dashboard.
 *
 * Usage:
 *   const out = await trackAiCost(
 *     { provider: "fal", operation: "text-to-video", userId, model },
 *     async () => await callFal(),
 *     // estimated cost in micro-USD; if you have actual usage in the
 *     // response you can pass a recompute function instead.
 *     ({ result, durationMs }) => ({ costMicroUsd: 200_000, durationMs })
 *   );
 */

import { prisma } from "./prisma";
import { log } from "./logger";

export interface CostMetadata {
  provider:
    | "fal"
    | "anthropic"
    | "openai"
    | "elevenlabs"
    | "syncLabs"
    | "suno"
    | "stripe"
    | "yoti"
    | "other";
  operation: string;
  model?: string;
  userId?: string;
}

export interface CostObservation {
  costMicroUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export async function trackAiCost<T>(
  meta: CostMetadata,
  fn: () => Promise<T>,
  observe?: (input: { result: T; durationMs: number }) => CostObservation
): Promise<T> {
  const t0 = Date.now();
  const result = await fn();
  const durationMs = Date.now() - t0;
  const obs = observe?.({ result, durationMs }) ?? { durationMs };

  // Best-effort write — never break the user-facing call on a ledger
  // failure.
  prisma.aiCostEntry
    .create({
      data: {
        provider: meta.provider,
        operation: meta.operation,
        model: meta.model,
        userId: meta.userId,
        costMicroUsd: Math.round(obs.costMicroUsd ?? 0),
        inputTokens: obs.inputTokens,
        outputTokens: obs.outputTokens,
        durationMs: obs.durationMs ?? durationMs,
        ...(obs.metadata ? { metadata: obs.metadata as object } : {}),
      },
    })
    .catch((err) => {
      log.warn("ai-cost ledger write failed", {
        provider: meta.provider,
        operation: meta.operation,
        err: err instanceof Error ? err.message : String(err),
      });
    });

  return result;
}
