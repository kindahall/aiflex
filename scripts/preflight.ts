/**
 * preflight.ts — production deployment validation.
 *
 * Run BEFORE every release. Verifies that everything the audit-hardened
 * code expects is actually present and reachable. Exit code = number of
 * MISSING checks (0 = green light).
 *
 * Usage:
 *   npx tsx scripts/preflight.ts
 *   npx tsx scripts/preflight.ts --json   # machine-readable for CI
 *
 * Exits non-zero if any required check fails. WARNs do not block.
 */

import { promises as fs } from "node:fs";

type Status = "ok" | "warn" | "missing";

interface CheckResult {
  name: string;
  status: Status;
  detail?: string;
  remediation?: string;
}

const results: CheckResult[] = [];

function ok(name: string, detail?: string): void {
  results.push({ name, status: "ok", detail });
}
function warn(name: string, detail: string, remediation?: string): void {
  results.push({ name, status: "warn", detail, remediation });
}
function missing(name: string, detail: string, remediation?: string): void {
  results.push({ name, status: "missing", detail, remediation });
}

function envPresent(key: string): boolean {
  const v = process.env[key];
  return v != null && v !== "";
}

// ---------------------------------------------------------------------------
// 1. Required prod secrets
// ---------------------------------------------------------------------------

async function checkRequiredSecrets(): Promise<void> {
  const required: Array<{ name: string; minLen: number; why: string }> = [
    { name: "AIFLEX_TOKEN_SECRET", minLen: 32, why: "HMAC reset/email tokens" },
    {
      name: "AIFLEX_LOCAL_STORAGE_SECRET",
      minLen: 16,
      why: "signed URLs (local fallback)",
    },
    {
      name: "STRIPE_WEBHOOK_SECRET",
      minLen: 16,
      why: "Stripe webhook signature verification",
    },
    { name: "CRON_SECRET", minLen: 16, why: "cron endpoint authentication" },
    {
      name: "TRUSTED_PROXY_SECRET",
      minLen: 16,
      why: "anti-spoof X-Forwarded-For trust",
    },
    {
      name: "DATABASE_URL",
      minLen: 20,
      why: "Postgres connection (Prisma)",
    },
  ];

  for (const r of required) {
    const v = process.env[r.name] || "";
    // AIFLEX_TOKEN_SECRET supports rotation → comma-separated; check shortest entry
    const parts =
      r.name === "AIFLEX_TOKEN_SECRET"
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [v];
    if (parts.length === 0 || parts.some((p) => !p)) {
      missing(r.name, `requis: ${r.why}`, `export ${r.name}=$(openssl rand -hex 32)`);
      continue;
    }
    const tooShort = parts.find((p) => p.length < r.minLen);
    if (tooShort) {
      missing(
        r.name,
        `trop court (${tooShort.length} < ${r.minLen})`,
        `export ${r.name}=$(openssl rand -hex 32)`
      );
      continue;
    }
    ok(r.name, `${parts.length} entrée(s), longueur min ${r.minLen} OK`);
  }
}

// ---------------------------------------------------------------------------
// 2. Database connectivity (Prisma + JSON-DB guard)
// ---------------------------------------------------------------------------

async function checkDatabase(): Promise<void> {
  if (process.env.DB_PROVIDER !== "prisma") {
    if (process.env.NODE_ENV === "production") {
      missing("DB_PROVIDER", "JSON DB désactivée en prod", "export DB_PROVIDER=prisma");
    } else {
      warn("DB_PROVIDER", "JSON DB en dev — OK localement, requis prisma en prod");
    }
  } else {
    ok("DB_PROVIDER", "prisma");
  }

  if (!envPresent("DATABASE_URL")) return;
  try {
    const { PrismaClient } = await import("@prisma/client");
    const p = new PrismaClient();
    const t0 = Date.now();
    await p.$queryRaw`SELECT 1`;
    await p.$disconnect();
    ok("DATABASE_URL", `connectivity OK (${Date.now() - t0}ms)`);
  } catch (err) {
    missing(
      "DATABASE_URL",
      `connect failed: ${(err as Error).message}`,
      "vérifier l'URL, le firewall, et que la DB est joignable"
    );
  }

  const dbUrl = process.env.DATABASE_URL || "";
  if (
    dbUrl.startsWith("postgres") &&
    !dbUrl.includes("pgbouncer=true") &&
    !dbUrl.includes("connection_limit=")
  ) {
    warn(
      "DATABASE_URL pooling",
      "ni pgbouncer=true ni connection_limit= — risque pool exhaustion en serverless",
      "ajoute ?pgbouncer=true&connection_limit=1 ou pointe vers un pooler"
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Redis (BullMQ) + Upstash (rate-limit)
// ---------------------------------------------------------------------------

async function checkRedis(): Promise<void> {
  if (!envPresent("REDIS_URL")) {
    warn(
      "REDIS_URL",
      "absent — BullMQ in-memory, jobs perdus au restart",
      "provisionne Redis et export REDIS_URL=redis://..."
    );
    return;
  }
  try {
    const mod = await import("ioredis").catch(() => null);
    if (!mod) {
      warn("REDIS_URL", "ioredis package indisponible");
      return;
    }
    const Redis =
      (mod as { default?: unknown; Redis?: unknown }).default ||
      (mod as { Redis?: unknown }).Redis ||
      mod;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = new (Redis as any)(process.env.REDIS_URL, {
      connectTimeout: 2000,
      maxRetriesPerRequest: 0,
      lazyConnect: true,
    });
    await client.connect();
    const pong = await client.ping();
    client.disconnect();
    if (pong === "PONG") {
      ok("REDIS_URL", "PING/PONG OK");
    } else {
      missing("REDIS_URL", `ping returned ${pong}`);
    }
  } catch (err) {
    missing(
      "REDIS_URL",
      `connect failed: ${(err as Error).message}`,
      "vérifier l'URL, l'auth, et que le serveur est joignable"
    );
  }
}

async function checkUpstash(): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) {
    warn(
      "UPSTASH_REDIS_REST_*",
      "absent — rate-limit local à chaque pod (bypassable en multi-instance)",
      "active Upstash pour les déploiements multi-pod"
    );
    return;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${url.replace(/\/$/, "")}/ping`, {
      headers: { Authorization: `Bearer ${tok}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (r.ok) ok("UPSTASH_REDIS_REST_*", `HTTP ${r.status}`);
    else missing("UPSTASH_REDIS_REST_*", `HTTP ${r.status}`);
  } catch (err) {
    missing("UPSTASH_REDIS_REST_*", `unreachable: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Storage (S3 / R2)
// ---------------------------------------------------------------------------

async function checkStorage(): Promise<void> {
  if (!envPresent("S3_BUCKET")) {
    if (process.env.NODE_ENV === "production") {
      missing(
        "S3_BUCKET",
        "stockage local en prod = perte de données au restart de pod",
        "configure S3 / R2 / B2"
      );
    } else {
      warn("S3_BUCKET", "absent — LocalStorage en dev (OK localement)");
    }
    return;
  }
  const endpoint = process.env.S3_ENDPOINT;
  const target = endpoint
    ? `${endpoint.replace(/\/$/, "")}/${process.env.S3_BUCKET}`
    : `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || "us-east-1"}.amazonaws.com`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(target, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    if (r.status < 500) ok("S3_BUCKET", `HEAD ${r.status}`);
    else missing("S3_BUCKET", `HEAD ${r.status}`);
  } catch (err) {
    missing("S3_BUCKET", `unreachable: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Stripe + OAuth + AI providers
// ---------------------------------------------------------------------------

function checkOAuthBundle(prefix: string, fields: string[]): void {
  const present = fields.filter((f) => envPresent(`${prefix}_${f}`));
  if (present.length === 0) {
    warn(`${prefix} OAuth`, "non configuré — provider désactivé");
  } else if (present.length < fields.length) {
    const missingFields = fields.filter((f) => !envPresent(`${prefix}_${f}`));
    missing(
      `${prefix} OAuth`,
      `partiel: manque ${missingFields.join(", ")}`,
      "OAuth doit avoir TOUS les credentials ou aucun"
    );
  } else {
    ok(`${prefix} OAuth`, "complet");
  }
}

function checkOAuthAndProviders(): void {
  // Stripe
  if (envPresent("STRIPE_SECRET_KEY")) {
    if (
      process.env.STRIPE_SECRET_KEY!.startsWith("sk_test") &&
      process.env.NODE_ENV === "production"
    ) {
      missing("STRIPE_SECRET_KEY", "clé TEST en production", "remplace par la clé sk_live_...");
    } else {
      ok("STRIPE_SECRET_KEY", "configurée");
    }
  } else {
    warn("STRIPE_SECRET_KEY", "absent — paiements désactivés");
  }

  // OAuth bundles (all-or-nothing)
  checkOAuthBundle("GOOGLE", ["CLIENT_ID", "CLIENT_SECRET"]);
  checkOAuthBundle("GITHUB", ["CLIENT_ID", "CLIENT_SECRET"]);
  checkOAuthBundle("APPLE", ["CLIENT_ID", "TEAM_ID", "KEY_ID", "PRIVATE_KEY"]);

  // AI providers — at least one moderation provider is required
  const hasAnthropic = envPresent("ANTHROPIC_API_KEY");
  const hasOpenAI = envPresent("OPENAI_API_KEY");
  if (!hasAnthropic && !hasOpenAI) {
    if (process.env.NODE_ENV === "production") {
      missing(
        "ANTHROPIC_API_KEY/OPENAI_API_KEY",
        "moderation fail-closed en prod sans aucun provider — toute génération bloquée",
        "configure au moins ANTHROPIC_API_KEY"
      );
    } else {
      warn("AI providers", "aucun configuré, modération bypass en dev");
    }
  } else {
    ok("AI providers", `${hasAnthropic ? "Anthropic " : ""}${hasOpenAI ? "OpenAI" : ""}`);
  }

  // FAL (video generation) — optional but flag it
  if (!envPresent("FAL_KEY")) {
    warn("FAL_KEY", "absent — génération vidéo désactivée");
  } else {
    ok("FAL_KEY", "configurée");
  }
}

// ---------------------------------------------------------------------------
// 6. Cert pinning (optional but recommended for security-critical hosts)
// ---------------------------------------------------------------------------

function checkCertPinning(): void {
  const pinHosts = [
    { env: "STRIPE_CERT_PINS_SHA256", host: "api.stripe.com" },
    { env: "APPLE_CERT_PINS_SHA256", host: "appleid.apple.com" },
    { env: "YOTI_CERT_PINS_SHA256", host: "api.yoti.com" },
  ];
  for (const p of pinHosts) {
    const v = process.env[p.env];
    if (!v) {
      warn(
        p.env,
        `pas de cert pinning pour ${p.host}`,
        `openssl s_client -connect ${p.host}:443 -servername ${p.host} </dev/null 2>/dev/null | openssl x509 -outform DER | openssl dgst -sha256 -hex`
      );
      continue;
    }
    const pins = v.split(",").map((s) => s.trim().toLowerCase());
    const bad = pins.filter((s) => !/^[0-9a-f]{64}$/.test(s));
    if (bad.length) {
      missing(p.env, `format invalide: ${bad[0]}`);
    } else {
      ok(p.env, `${pins.length} pin(s) ${p.host}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. CSRF + WAF + headers configuration
// ---------------------------------------------------------------------------

function checkSecurityHeaders(): void {
  if (!envPresent("APP_URL") && !envPresent("NEXT_PUBLIC_APP_URL")) {
    missing(
      "APP_URL / NEXT_PUBLIC_APP_URL",
      "absent — la garde CSRF refusera toutes les requêtes",
      "export APP_URL=https://aiflex.app"
    );
  } else {
    ok("APP_URL", "configurée");
  }

  if (process.env.WAF_DISABLED === "1") {
    warn("WAF_DISABLED", "WAF applicatif désactivé");
  } else {
    ok("WAF", "actif");
  }

  if (process.env.CSP_ENFORCE === "1") {
    ok("CSP_ENFORCE", "Content-Security-Policy en mode enforce");
  } else {
    warn(
      "CSP_ENFORCE",
      "CSP en report-only — passe en enforce une fois validée",
      "export CSP_ENFORCE=1"
    );
  }
}

// ---------------------------------------------------------------------------
// 8. Backup / observability
// ---------------------------------------------------------------------------

async function checkBackupAndObservability(): Promise<void> {
  if (!envPresent("BACKUP_BUCKET") || !envPresent("BACKUP_GPG_RECIPIENT")) {
    warn(
      "BACKUP_*",
      "scripts/backup-db.sh ne tournera pas",
      "configure BACKUP_BUCKET + BACKUP_GPG_RECIPIENT et schedule un cron horaire"
    );
  } else {
    ok("BACKUP_*", "snapshot script configuré");
  }

  if (!envPresent("SENTRY_DSN") && !envPresent("NEXT_PUBLIC_SENTRY_DSN")) {
    warn("SENTRY_DSN", "Sentry non configuré — observabilité aveugle");
  } else {
    ok("SENTRY_DSN", "Sentry actif");
  }

  if (!envPresent("HEALTH_DETAIL_TOKEN") && process.env.NODE_ENV === "production") {
    warn(
      "HEALTH_DETAIL_TOKEN",
      "absent — /api/health verbose désactivé en prod",
      "export HEALTH_DETAIL_TOKEN=$(openssl rand -hex 24)"
    );
  } else if (envPresent("HEALTH_DETAIL_TOKEN")) {
    ok("HEALTH_DETAIL_TOKEN", "configuré");
  }
}

// ---------------------------------------------------------------------------
// 9. Worker / cron deployment topology
// ---------------------------------------------------------------------------

function checkRoleTopology(): void {
  const role = (process.env.AIFLEX_ROLE || "all").toLowerCase();
  if (!["web", "worker", "all"].includes(role)) {
    missing("AIFLEX_ROLE", `valeur invalide: ${role}`, "web | worker | all");
    return;
  }
  ok("AIFLEX_ROLE", role);
  if (
    role === "all" &&
    process.env.NODE_ENV === "production" &&
    process.env.AIFLEX_ALLOW_MONOLITH !== "1"
  ) {
    warn(
      "AIFLEX_ROLE=all in prod",
      "web et worker dans le même process — bottleneck CPU en prod",
      "déploie deux services séparés (web + worker) ou export AIFLEX_ALLOW_MONOLITH=1"
    );
  }
}

// ---------------------------------------------------------------------------
// 10. Filesystem sanity (no leaked dev artifacts in the image)
// ---------------------------------------------------------------------------

async function checkArtifacts(): Promise<void> {
  const leaks = [".aiflex-admin-credentials", ".env.local", ".data/db.json"];
  for (const f of leaks) {
    try {
      await fs.access(f);
      if (process.env.NODE_ENV === "production") {
        missing(`leftover ${f}`, "présent dans l'image — risque de fuite", `rm ${f} avant build`);
      } else {
        ok(`leftover ${f}`, "présent (dev OK)");
      }
    } catch {
      ok(`leftover ${f}`, "absent");
    }
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await checkRequiredSecrets();
  await checkDatabase();
  await checkRedis();
  await checkUpstash();
  await checkStorage();
  checkOAuthAndProviders();
  checkCertPinning();
  checkSecurityHeaders();
  await checkBackupAndObservability();
  checkRoleTopology();
  await checkArtifacts();

  const counts = results.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }),
    {} as Record<Status, number>
  );

  const json = process.argv.includes("--json");
  if (json) {
    process.stdout.write(JSON.stringify({ counts, results }, null, 2) + "\n");
  } else {
    const ICONS: Record<Status, string> = { ok: "OK ", warn: "!! ", missing: "XX " };
    const COLORS: Record<Status, string> = {
      ok: "\x1b[32m",
      warn: "\x1b[33m",
      missing: "\x1b[31m",
    };
    const RESET = "\x1b[0m";
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(
        `${COLORS[r.status]}${ICONS[r.status]}${RESET} ${r.name.padEnd(34)} ${r.detail || ""}`
      );
      if (r.remediation) {
        // eslint-disable-next-line no-console
        console.log(`         → ${r.remediation}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `\nSummary: ${counts.ok || 0} OK · ${counts.warn || 0} WARN · ${counts.missing || 0} MISSING`
    );
  }

  // Exit code = number of MISSING (so CI can branch on it).
  process.exit(counts.missing || 0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[preflight] fatal", err);
  process.exit(255);
});
