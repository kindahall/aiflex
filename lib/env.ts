import "server-only";

/**
 * Boot-time environment validation.
 *
 * Read every env var the app depends on through `env.*` instead of
 * `process.env.*` directly. `assertProductionEnv()` runs once on first
 * import (via instrumentation.ts) and fails the boot if a production
 * deployment is missing a required secret — fail-loud is better than
 * silently degrading to a dev fallback.
 *
 * Kept dependency-free (no Zod) so it's importable from Edge + Node.
 */

export type EnvShape = {
  NODE_ENV: "development" | "production" | "test";

  // Core
  DATABASE_URL?: string;
  AIFLEX_TOKEN_SECRET?: string;
  AIFLEX_LOCAL_STORAGE_SECRET?: string;

  // Stripe
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_ALLOWED_IPS?: string;

  // OAuth
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;

  // Infra hardening
  TRUSTED_PROXY_SECRET?: string;
  CSRF_TRUST_REQUEST_HOST?: string;
  ADDITIONAL_ALLOWED_ORIGINS?: string;
  SSRF_ALLOWED_HOSTS?: string;
  CRON_SECRET?: string;
  CRON_ALLOWED_IPS?: string;

  // Optional
  HEALTH_DETAIL_TOKEN?: string;
  YOTI_WEBHOOK_TOKEN?: string;

  // Job queue / multi-instance
  REDIS_URL?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
};

function read(key: keyof EnvShape): string | undefined {
  const v = process.env[key as string];
  return v == null || v === "" ? undefined : v;
}

export const env: EnvShape = new Proxy({} as EnvShape, {
  get(_, key) {
    if (key === "NODE_ENV") {
      return (process.env.NODE_ENV as EnvShape["NODE_ENV"]) ?? "development";
    }
    return read(key as keyof EnvShape);
  },
});

interface Check {
  name: keyof EnvShape;
  minLen?: number;
  why: string;
}

const PRODUCTION_REQUIRED: Check[] = [
  {
    name: "AIFLEX_TOKEN_SECRET",
    minLen: 32,
    why: "HMAC-signed reset/verify tokens",
  },
  {
    name: "AIFLEX_LOCAL_STORAGE_SECRET",
    minLen: 16,
    why: "signed URLs for the LocalStorage fallback",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    minLen: 16,
    why: "mandatory Stripe signature verification",
  },
  {
    name: "CRON_SECRET",
    minLen: 16,
    why: "cron endpoint authentication",
  },
  {
    name: "TRUSTED_PROXY_SECRET",
    minLen: 16,
    why: "anti-spoof client-IP resolution (required so the rate-limiter can distribguish real clients from forged X-Forwarded-For headers)",
  },
];

let validated = false;

/**
 * Fail-fast guard intended for server boot. Safe to call many times —
 * only runs once. Throws when a production deployment is missing a
 * required secret, otherwise logs warnings and returns.
 */
export function assertProductionEnv(): void {
  if (validated) return;
  validated = true;
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  if (!isProd) return;

  const errors: string[] = [];
  for (const check of PRODUCTION_REQUIRED) {
    const v = read(check.name);
    if (!v) {
      errors.push(`${check.name} manquant — ${check.why}`);
      continue;
    }
    if (check.minLen && v.length < check.minLen) {
      errors.push(`${check.name} trop court (${v.length} < ${check.minLen}) — ${check.why}`);
    }
  }

  // OAuth providers are optional-as-a-bundle: if one is turned on, all
  // credentials for that provider must be present.
  const googleAny = !!(env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_SECRET);
  if (googleAny && !(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)) {
    errors.push("Google OAuth partiellement configuré (ID + secret requis ensemble)");
  }
  const githubAny = !!(env.GITHUB_CLIENT_ID || env.GITHUB_CLIENT_SECRET);
  if (githubAny && !(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)) {
    errors.push("GitHub OAuth partiellement configuré");
  }
  const appleAny = !!(
    env.APPLE_CLIENT_ID ||
    env.APPLE_TEAM_ID ||
    env.APPLE_KEY_ID ||
    env.APPLE_PRIVATE_KEY
  );
  if (
    appleAny &&
    !(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY)
  ) {
    errors.push("Apple OAuth partiellement configuré");
  }

  // Multi-instance / persistent queue. We won't fail-fast here (some
  // operators run a single VPS where in-memory queues are fine) but we
  // emit a loud warning so the operator notices when they scale out.
  const hasQueue = !!env.REDIS_URL;
  const hasDistributedRate = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
  if (!hasQueue) {
    // eslint-disable-next-line no-console
    console.warn(
      "[AIflex] REDIS_URL absent en production — BullMQ retombe en in-memory, " +
        "les jobs seront perdus au redémarrage. Configure Redis avant un déploiement multi-instance."
    );
  }
  if (!hasDistributedRate && (process.env.AIFLEX_INSTANCE_COUNT || "1") !== "1") {
    // eslint-disable-next-line no-console
    console.warn(
      "[AIflex] AIFLEX_INSTANCE_COUNT > 1 mais Upstash Redis (rate-limit) non configuré — " +
        "les compteurs seront locaux à chaque pod et bypassables."
    );
  }

  // Connection pooling sanity check. Serverless deployments running
  // Prisma against a vanilla DATABASE_URL exhaust the DB connection pool
  // very quickly. Recommend `connection_limit=1&pool_timeout=20` (the
  // pgbouncer pattern) or — better — point DATABASE_URL at a pooled
  // endpoint (Supabase pooler / Neon / pgbouncer sidecar).
  const dbUrl = env.DATABASE_URL || "";
  if (dbUrl && dbUrl.startsWith("postgres") && !dbUrl.includes("pgbouncer=true")) {
    if (!dbUrl.includes("connection_limit=")) {
      // eslint-disable-next-line no-console
      console.warn(
        "[AIflex] DATABASE_URL ne contient ni `pgbouncer=true` ni `connection_limit=` — " +
          "risque d'épuisement du pool en environnement serverless. " +
          "Recommandation : `?pgbouncer=true&connection_limit=1` ou pointer vers un pooler."
      );
    }
  }

  if (errors.length) {
    const msg = "[AIflex] Environment validation failed:\n  - " + errors.join("\n  - ");
    // Fail loudly — refusing to boot is safer than shipping without
    // the security-critical secrets.
    throw new Error(msg);
  }
}
