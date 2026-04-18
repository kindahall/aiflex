import "server-only";
import { prisma } from "./prisma";

/**
 * Server-side feature flag reader (V8 §B7.6).
 *
 * Source of truth: `PlatformSettings` columns (`sequelsEnabled`, ...).
 * GrowthBook/PostHog wiring can replace the impl later — keep the API
 * minimal so call sites don't change.
 *
 * Cached per-process for 30s. Force-refresh via `invalidateFeatureFlagsCache()`
 * after an admin toggle.
 */

export type FeatureFlagKey =
  | "sequelsEnabled"
  | "adsEnabled"
  | "shortsEnabled"
  | "dubbingEnabled"
  | "recommendationsEnabled";

interface CacheEntry {
  flags: Record<FeatureFlagKey, boolean>;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 30_000;

const DEFAULTS: Record<FeatureFlagKey, boolean> = {
  sequelsEnabled: true,
  adsEnabled: false,
  shortsEnabled: false,
  dubbingEnabled: false,
  recommendationsEnabled: false,
};

export async function getFeatureFlags(): Promise<Record<FeatureFlagKey, boolean>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.flags;
  }
  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: {
        sequelsEnabled: true,
        adsEnabled: true,
        shortsEnabled: true,
        dubbingEnabled: true,
        recommendationsEnabled: true,
      },
    });
    const flags = settings ?? DEFAULTS;
    cache = { flags: flags as Record<FeatureFlagKey, boolean>, fetchedAt: now };
    return cache.flags;
  } catch {
    return DEFAULTS;
  }
}

export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[key] ?? false;
}

export function invalidateFeatureFlagsCache(): void {
  cache = null;
}
