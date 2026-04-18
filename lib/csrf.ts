/**
 * CSRF Origin header check for state-changing API requests.
 *
 * Primary defense is `SameSite=strict` on the session cookie; this is the
 * second layer. Rejects any non-safe method whose Origin doesn't match the
 * app's own origin.
 *
 * Skipped for:
 *   - Safe methods (GET, HEAD, OPTIONS)
 *   - Non-/api paths
 *   - Stripe webhook (/api/webhooks/stripe) — signed separately
 *   - Cron endpoints — protected by CRON_SECRET + IP allowlist
 *
 * Returns `true` if the request should be blocked, `false` if it passes.
 */
export function shouldBlockForCsrf(request: {
  method: string;
  nextUrl: { pathname: string };
  headers: { get(name: string): string | null };
}): boolean {
  const { pathname } = request.nextUrl;
  const method = request.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  if (!pathname.startsWith("/api")) return false;
  if (pathname === "/api/webhooks/stripe") return false;

  const origin = request.headers.get("origin");
  if (!origin) {
    // Server-to-server requests (cron, curl) don't send Origin; they rely on
    // their own auth (CRON_SECRET, Stripe signature, etc.).
    return false;
  }

  const allowed = new Set<string>();
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) allowed.add(appUrl.replace(/\/$/, ""));
  const host = request.headers.get("host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    allowed.add(`${proto}://${host}`);
  }

  return !allowed.has(origin);
}
