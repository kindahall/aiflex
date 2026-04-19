import { NextRequest, NextResponse } from "next/server";
import {
  apiLimiter,
  authLimiter,
  videoGenLimiter,
  uploadLimiter,
  agentStartLimiter,
  sequelLimiter,
  signupLimiter,
  commentLimiter,
  reportLimiter,
  RateLimitError,
  type RateLimiter,
} from "@/lib/rate-limit";
import { shouldBlockForCsrf } from "@/lib/csrf";
import { getTrustedClientIp } from "@/lib/client-ip";
import { wafScan } from "@/lib/waf";

// Match the name used in lib/auth.ts — prefixed in production, plain in dev.
const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-aiflex_session" : "aiflex_session";

/**
 * Resolve the client IP from request headers.
 * Uses the trusted-proxy chain logic in lib/client-ip.ts — never the
 * left-most `x-forwarded-for` value alone (which is client-controlled).
 */
function getClientIp(request: NextRequest): string {
  return getTrustedClientIp(request);
}

/**
 * Pick the appropriate limiter and limit value based on the request path.
 * Order matters — more specific paths first.
 */
interface LimiterChoice {
  limiter: RateLimiter;
  limit: number;
  name: string;
}

function getLimiterForPath(pathname: string, method: string): LimiterChoice {
  // Auth-specific stricter limits
  if (pathname === "/api/auth/signup" && method === "POST") {
    return { limiter: signupLimiter, limit: 3, name: "signup" };
  }
  if (pathname.startsWith("/api/auth")) {
    return { limiter: authLimiter, limit: 10, name: "auth" };
  }

  // Generation & agent — expensive endpoints
  if (pathname === "/api/sequel" && method === "POST") {
    return { limiter: sequelLimiter, limit: 2, name: "sequel" };
  }
  if (pathname === "/api/agent/start" && method === "POST") {
    return { limiter: agentStartLimiter, limit: 5, name: "agent-start" };
  }
  if (
    pathname === "/api/scene-video" ||
    pathname.startsWith("/api/scene-video/") ||
    pathname.startsWith("/api/generate/")
  ) {
    return { limiter: videoGenLimiter, limit: 5, name: "video" };
  }

  // Reports (anti-abuse). Accept both the singular (current) and plural
  // prefixes — the original regex had a typo that made this limiter
  // effectively dead code (audit M-12).
  if (
    pathname === "/api/report" ||
    pathname.startsWith("/api/report/") ||
    pathname.startsWith("/api/reports") ||
    pathname === "/api/legal/dmca"
  ) {
    return { limiter: reportLimiter, limit: 5, name: "report" };
  }

  // Comments (anti-spam)
  if (pathname.startsWith("/api/comments") || /\/api\/projects\/[^/]+\/comments/.test(pathname)) {
    return { limiter: commentLimiter, limit: 20, name: "comment" };
  }

  // Uploads
  if (pathname === "/api/upload" || pathname.startsWith("/api/upload/")) {
    return { limiter: uploadLimiter, limit: 20, name: "upload" };
  }

  return { limiter: apiLimiter, limit: 60, name: "api" };
}

/**
 * Admin route protection: redirect to /login if no session cookie.
 * NOTE: this is only a coarse "logged-in" check — the actual role=admin
 * check MUST be performed inside each admin page/route via server-side
 * `getCurrentUser()`, because Prisma cannot run in the Edge runtime.
 */
function protectAdminRoutes(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const isAdminPage = pathname.startsWith("/admin") && !pathname.startsWith("/api");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminPage && !isAdminApi) return null;

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) {
    if (isAdminApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return null;
}

function applySecurityHeaders(res: NextResponse, req?: NextRequest): NextResponse {
  // Conservative defaults. Operators can tighten further via a CSP that
  // enumerates every legitimate third-party domain (Stripe, Sentry,
  // providers).
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // /embed/* is designed to be iframed from anywhere. Everything else is
  // locked to SAMEORIGIN so an attacker can't frame our app into their
  // page for a clickjacking attack.
  const path = req?.nextUrl.pathname || "";
  const isEmbed = path.startsWith("/embed/");
  if (isEmbed) {
    res.headers.delete("X-Frame-Options");
  } else {
    res.headers.set("X-Frame-Options", "SAMEORIGIN");
  }
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(self)");
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  // CSP — enforced in production by default. Operators stay in report-only
  // in dev so iteration is quick; the explicit CSP_ENFORCE=0 is the
  // documented escape hatch for production rollouts that still need one
  // ship cycle of violation reports before flipping to enforce.
  const csp =
    "default-src 'self'; " +
    "img-src 'self' data: blob: https:; " +
    "media-src 'self' blob: https:; " +
    "font-src 'self' data: https:; " +
    "style-src 'self' 'unsafe-inline' https:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; " +
    "connect-src 'self' https: wss:; " +
    "frame-ancestors 'self'; " +
    "base-uri 'self'; " +
    "form-action 'self'";
  const enforceFlag = process.env.CSP_ENFORCE;
  const enforce = enforceFlag === "1" || (enforceFlag !== "0" && isRuntimeProduction());
  const header = enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
  res.headers.set(header, csp);
  return res;
}

/** Production-ness gate that isn't fooled by NODE_ENV=development in prod. */
function isRuntimeProduction(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.VERCEL_ENV === "production") return true;
  if (process.env.AIFLEX_FORCE_PROD_GUARDS === "1") return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF Origin check before anything else (see lib/csrf.ts for scope rules).
  if (shouldBlockForCsrf(request)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  // Lightweight WAF — pattern-based block of obvious attack payloads.
  // Defense-in-depth on top of any real WAF (Cloudflare, AWS WAF) the
  // operator deploys upstream. Set WAF_DISABLED=1 to bypass entirely.
  if (process.env.WAF_DISABLED !== "1") {
    const verdict = wafScan(request);
    if (verdict.blocked) {
      return applySecurityHeaders(
        NextResponse.json(
          { error: "Requête refusée par la sécurité applicative." },
          { status: 400 }
        ),
        request
      );
    }
  }

  // Admin gate first (works on both pages and APIs)
  const adminGate = protectAdminRoutes(request);
  if (adminGate) return applySecurityHeaders(adminGate, request);

  // Referral cookie drop (V8 §21.3) — preserves inbound `?ref=` for 30 days
  // so when the visitor eventually signs up we know who referred them.
  const refCode = request.nextUrl.searchParams.get("ref");
  if (refCode && !pathname.startsWith("/api")) {
    // Tight format — ref codes are [A-Za-z0-9_-]{1,20}. Anything else
    // would be path-injection / open-redirect bait.
    const sanitized = refCode.slice(0, 20).replace(/[^A-Za-z0-9_-]/g, "");
    if (sanitized) {
      const res = NextResponse.next();
      res.cookies.set("aiflex_ref", sanitized, {
        maxAge: 30 * 24 * 60 * 60,
        path: "/",
        sameSite: "lax",
        httpOnly: false, // readable by client for analytics
      });
      return applySecurityHeaders(res, request);
    }
  }

  // Only rate-limit API routes below here
  if (!pathname.startsWith("/api")) {
    return applySecurityHeaders(NextResponse.next(), request);
  }

  // Rate-limiting is now enforced in production AND in any runtime that
  // looks production-ish (Vercel preview, staging with an override env).
  // The old `NODE_ENV !== "production"` skip was a footgun — misconfigured
  // prod deployments ran wide-open.
  if (!isRuntimeProduction()) {
    return applySecurityHeaders(NextResponse.next(), request);
  }

  const ip = getClientIp(request);
  const { limiter, limit, name } = getLimiterForPath(pathname, request.method);
  const token = `${ip}:${name}`;

  try {
    const result = await limiter.check(limit, token);
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    response.headers.set("X-RateLimit-Reset", String(result.reset));
    return applySecurityHeaders(response, request);
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      const { rateLimitResult } = error;
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: "Too Many Requests",
            message: `Rate limit exceeded. Try again after ${new Date(rateLimitResult.reset * 1000).toISOString()}.`,
          },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": String(rateLimitResult.limit),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(rateLimitResult.reset),
              "Retry-After": String(Math.ceil(rateLimitResult.reset - Date.now() / 1000)),
            },
          }
        ),
        request
      );
    }
    // Fail-open on infrastructure error (e.g. Upstash timeout) to keep
    // the app available — but surface the failure loudly. Sentry import
    // is dynamic so the middleware still works if the DSN isn't set.
    // eslint-disable-next-line no-console
    console.error("[middleware] rate-limit check failed (fail-open):", error);
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(error, {
        tags: { subsystem: "middleware", reason: "rate-limit-fail-open" },
        extra: { pathname, ip, name },
      });
    } catch {
      /* Sentry unavailable — console log above is the best we can do. */
    }
    return applySecurityHeaders(NextResponse.next(), request);
  }
}

export const config = {
  // Match API + admin for rate-limit/auth, plus all non-asset pages so the
  // referral cookie (V8 §21.3) is captured on any entry URL. The exclusions
  // skip Next.js internals, static assets and the favicon to avoid perf hit.
  matcher: [
    "/api/:path*",
    "/admin/:path*",
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|uploads/).*)",
  ],
};
