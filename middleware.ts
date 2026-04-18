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
} from "@/lib/rate-limit";

const SESSION_COOKIE = "aiflex_session";

/**
 * Resolve the client IP from request headers.
 * Falls back to "anonymous" when running locally without a proxy.
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "anonymous";
}

/**
 * Pick the appropriate limiter and limit value based on the request path.
 * Order matters — more specific paths first.
 */
function getLimiterForPath(
  pathname: string,
  method: string
): { limiter: ReturnType<typeof apiLimiter.check> extends Promise<infer _> ? typeof apiLimiter : never; limit: number; name: string } {
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

  // Reports (anti-abuse)
  if (pathname.startsWith("/api/reports") || pathname === "/api/legal/dmca") {
    return { limiter: reportLimiter, limit: 5, name: "report" };
  }

  // Comments (anti-spam)
  if (
    pathname.startsWith("/api/comments") ||
    /\/api\/projects\/[^/]+\/comments/.test(pathname)
  ) {
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
  const isAdminPage =
    pathname.startsWith("/admin") && !pathname.startsWith("/api");
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

/**
 * Defense-in-depth CSRF check for state-changing API requests.
 *
 * Primary CSRF defense is `SameSite=strict` on the session cookie (see
 * lib/auth.ts), which already blocks cross-site POSTs from carrying credentials.
 * This Origin-header check is a second layer: reject any mutation whose
 * Origin is not one of the allowed origins.
 *
 * Skipped for:
 *   - Safe methods (GET, HEAD, OPTIONS)
 *   - Non-/api paths
 *   - Stripe webhook (/api/webhooks/stripe) which is signed separately
 *   - Cron endpoints (protected by CRON_SECRET + IP allowlist)
 */
function csrfOriginCheck(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const method = request.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  if (!pathname.startsWith("/api")) return null;
  if (pathname === "/api/webhooks/stripe") return null;

  const origin = request.headers.get("origin");
  if (!origin) {
    // Curl/server-to-server requests without an Origin (e.g., cron secret
    // path) are authenticated by their own mechanism, so let them through.
    return null;
  }

  const allowed = new Set<string>();
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) allowed.add(appUrl.replace(/\/$/, ""));
  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    allowed.add(`${proto}://${host}`);
  }

  if (!allowed.has(origin)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF Origin check before anything else
  const csrfBlock = csrfOriginCheck(request);
  if (csrfBlock) return csrfBlock;

  // Admin gate first (works on both pages and APIs)
  const adminGate = protectAdminRoutes(request);
  if (adminGate) return adminGate;

  // Referral cookie drop (V8 §21.3) — preserves inbound `?ref=` for 30 days
  // so when the visitor eventually signs up we know who referred them.
  const refCode = request.nextUrl.searchParams.get("ref");
  if (refCode && !pathname.startsWith("/api")) {
    const res = NextResponse.next();
    res.cookies.set("aiflex_ref", refCode.slice(0, 20), {
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
      sameSite: "lax",
      httpOnly: false, // readable by client for analytics
    });
    return res;
  }

  // Only rate-limit API routes below here
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Skip rate limiting in development for localhost
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { limiter, limit, name } = getLimiterForPath(pathname, request.method) as any;
  const token = `${ip}:${name}`;

  try {
    const result = await (limiter as { check: (l: number, t: string) => Promise<{ limit: number; remaining: number; reset: number }> }).check(limit, token);
    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Limit", String(result.limit));
    response.headers.set("X-RateLimit-Remaining", String(result.remaining));
    response.headers.set("X-RateLimit-Reset", String(result.reset));
    return response;
  } catch (error: unknown) {
    if (error instanceof RateLimitError) {
      const { rateLimitResult } = error;
      return NextResponse.json(
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
      );
    }
    // eslint-disable-next-line no-console
    console.error("[middleware] Rate limit check failed:", error);
    return NextResponse.next();
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
