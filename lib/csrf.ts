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

  // Additional allowlisted origins — use a comma-separated env var for
  // staging / preview deployments rather than trusting the Host header
  // (which a reverse proxy may forward untouched from the attacker).
  const extraOrigins = (process.env.ADDITIONAL_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  for (const o of extraOrigins) allowed.add(o);

  // Fallback to request Host only when explicitly opted-in. This protects
  // against Host-header attacks behind reverse proxies that don't
  // sanitize.
  if (process.env.CSRF_TRUST_REQUEST_HOST === "1") {
    const host = request.headers.get("host");
    if (host) {
      const proto = request.headers.get("x-forwarded-proto") || "https";
      allowed.add(`${proto}://${host}`);
    }
  }

  // If no origin is allowlisted at all we fail safe: block.
  if (allowed.size === 0) return true;

  return !allowed.has(origin);
}
