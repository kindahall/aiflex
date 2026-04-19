import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { getSettings, listAllProjects } from "@/lib/server-db";
import { hasSeedanceKey } from "@/lib/seedance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight liveness + dependency check. Hit by uptime monitors and the
 * future deployment platform's healthcheck. Stays cheap on purpose: it
 * confirms the DB is reachable and reports which external services are
 * configured, without making any network call to them.
 *
 * Returns 200 if the core stack (DB + auth) is healthy. The IA providers
 * being absent is *not* a failure — it just degrades the studio. Add a
 * `?strict=1` to also fail when ANTHROPIC_API_KEY or FAL_KEY are missing.
 */
export async function GET(req: Request) {
  const start = Date.now();
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // --- DB reachability (read + bootstrap)
  try {
    await listAllProjects();
    checks.db = { ok: true };
  } catch (err) {
    checks.db = {
      ok: false,
      detail: err instanceof Error ? err.message : "unknown",
    };
  }

  // --- Settings hydration
  try {
    const s = await getSettings();
    checks.settings = {
      ok: true,
      detail: `narrative=${s.narrativeModel}, video=${s.videoModel}`,
    };
  } catch (err) {
    checks.settings = {
      ok: false,
      detail: err instanceof Error ? err.message : "unknown",
    };
  }

  // --- External provider configuration (presence only, no network call)
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  checks.openai = {
    ok: hasOpenAI,
    detail: hasOpenAI ? "configured" : "OPENAI_API_KEY missing",
  };
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  checks.anthropic = {
    ok: hasAnthropic,
    detail: hasAnthropic ? "configured" : "ANTHROPIC_API_KEY missing",
  };
  const hasFal = await hasSeedanceKey();
  checks.seedance = {
    ok: hasFal,
    detail: hasFal ? "configured" : "FAL_KEY missing",
  };

  // --- Prisma direct ping (V8 §25.7) — more reliable than the JSON adapter
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.prisma = { ok: true };
  } catch (err) {
    checks.prisma = {
      ok: false,
      detail: err instanceof Error ? err.message : "unknown",
    };
  }

  // --- B2 / S3 bucket reachability (HEAD, no upload)
  if (process.env.S3_BUCKET) {
    const endpoint = process.env.S3_ENDPOINT;
    const target = endpoint
      ? `${endpoint.replace(/\/$/, "")}/${process.env.S3_BUCKET}`
      : `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || "us-east-1"}.amazonaws.com`;
    try {
      // Use AbortController for quick timeout — health checks must stay snappy
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3_000);
      const r = await fetch(target, { method: "HEAD", signal: ctrl.signal });
      clearTimeout(timer);
      // 200/403 are both proof the bucket exists; only network errors fail.
      checks.storage = { ok: r.status < 500, detail: `HTTP ${r.status}` };
    } catch (err) {
      checks.storage = {
        ok: false,
        detail: err instanceof Error ? err.message : "unreachable",
      };
    }
  } else {
    checks.storage = { ok: true, detail: "S3_BUCKET not set (local FS mode)" };
  }

  // --- Redis ping (only if REDIS_URL is set — feature backlog)
  if (process.env.REDIS_URL) {
    try {
      // Avoid a hard ioredis import — the dep isn't installed by default.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await (
        Function("return import('ioredis')") as () => Promise<unknown>
      )().catch(() => null);
      if (!mod) {
        checks.redis = { ok: false, detail: "ioredis package not installed" };
      } else {
        const Redis = mod.default || mod.Redis || mod;
        const client = new Redis(process.env.REDIS_URL, {
          connectTimeout: 2000,
          maxRetriesPerRequest: 0,
        });
        const pong = await client.ping();
        client.disconnect();
        checks.redis = { ok: pong === "PONG", detail: pong };
      }
    } catch (err) {
      checks.redis = {
        ok: false,
        detail: err instanceof Error ? err.message : "unknown",
      };
    }
  } else {
    checks.redis = { ok: true, detail: "REDIS_URL not set (in-memory queue)" };
  }

  // --- Upstash Redis (rate-limit backend) ping — separate from REDIS_URL
  // because they're often two different services (BullMQ on managed
  // Redis, rate-limit on Upstash REST). Multi-instance deployments need
  // BOTH for correctness.
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2_000);
      const r = await fetch(`${process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, "")}/ping`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      checks.upstash = { ok: r.ok, detail: `HTTP ${r.status}` };
    } catch (err) {
      checks.upstash = {
        ok: false,
        detail: err instanceof Error ? err.message : "unreachable",
      };
    }
  } else {
    checks.upstash = {
      ok: true,
      detail: "Upstash not configured (single-instance rate-limit OK)",
    };
  }

  // --- Disk space — fs.statfs is Node 18.15+ but best-effort
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fsAny = fs as any;
    const stats = fsAny.statfs ? await fsAny.statfs("/") : null;
    if (stats) {
      const freeGb = (Number(stats.bavail) * Number(stats.bsize)) / 1024 ** 3;
      checks.disk = {
        ok: freeGb > 1, // alert if < 1 GB free
        detail: `${freeGb.toFixed(1)} GB free`,
      };
    } else {
      checks.disk = { ok: true, detail: "statfs unavailable" };
    }
  } catch (err) {
    checks.disk = {
      ok: true, // soft check — never block health on this
      detail: err instanceof Error ? err.message : "unknown",
    };
  }

  const url = new URL(req.url);
  const strict = url.searchParams.get("strict") === "1";

  const coreOk = checks.db.ok && checks.settings.ok && checks.prisma.ok && checks.storage.ok;
  const hasNarrative = hasOpenAI || hasAnthropic;
  const fullyOk =
    coreOk && hasNarrative && hasFal && checks.redis.ok && checks.upstash.ok && checks.disk.ok;
  const ok = strict ? fullyOk : coreOk;

  // In production we return a minimal payload to avoid leaking
  // environment / version / integration inventory to casual visitors.
  // Operators who need the full report can pass ?verbose=1 + a bearer
  // token matching HEALTH_DETAIL_TOKEN.
  const isProd = process.env.NODE_ENV === "production";
  const verbose = url.searchParams.get("verbose") === "1";
  const tokenHeader = req.headers.get("authorization") || "";
  const expected = process.env.HEALTH_DETAIL_TOKEN;
  const tokenOk = !!expected && tokenHeader === `Bearer ${expected}`;
  const showDetails = !isProd || (verbose && tokenOk);

  if (!showDetails) {
    return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
  }

  return NextResponse.json(
    {
      ok,
      strict,
      checks,
      uptimeMs: process.uptime() * 1000,
      latencyMs: Date.now() - start,
      version: process.env.npm_package_version || "0.1.0",
      env: process.env.NODE_ENV,
    },
    { status: ok ? 200 : 503 }
  );
}
