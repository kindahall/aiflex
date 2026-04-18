import "server-only";

/**
 * Thin observability wrappers for Sentry + PostHog (V8 §B7.1).
 *
 * Design goals:
 *   - **No hard dependency** — the real SDKs are listed under
 *     `//deps-to-add-as-features-land` in package.json. Until the user runs
 *     `npm i @sentry/nextjs posthog-node`, these helpers resolve to no-ops
 *     so nothing breaks in dev.
 *   - **Dynamic import** — never imported at module load time so the SDK
 *     doesn't bloat the cold start of every request.
 *   - **Centralised namespace** — all tracked events pass through here so
 *     grep finds every call site when we want to change/tag something.
 *
 * Usage:
 *   import { captureError, trackEvent } from "@/lib/observability";
 *   try { ... } catch (e) { captureError(e, { route: "/api/..." }); throw e; }
 *   trackEvent(userId, "generation_completed", { filmId });
 */

// ---------------------------------------------------------------------------
// Errors → Sentry
// ---------------------------------------------------------------------------

export interface ErrorContext {
  route?: string;
  userId?: string;
  jobId?: string;
  projectId?: string;
  [k: string]: unknown;
}

export async function captureError(
  err: unknown,
  context: ErrorContext = {}
): Promise<void> {
  // eslint-disable-next-line no-console
  console.error(`[${context.route ?? "error"}]`, err, context);

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    // @ts-expect-error — optional dep, not in package.json
    const sentry = await import("@sentry/nextjs").catch(() => null);
    if (!sentry) return;
    sentry.captureException(err, {
      tags: {
        route: context.route ?? "unknown",
      },
      user: context.userId ? { id: context.userId } : undefined,
      extra: context,
    });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Product events → PostHog
// ---------------------------------------------------------------------------

export type ProductEvent =
  | "signup"
  | "login"
  | "generation_started"
  | "generation_completed"
  | "generation_failed"
  | "sequel_created"
  | "sequel_disavowed"
  | "upload_submitted"
  | "upload_approved"
  | "upload_rejected"
  | "boost_purchased"
  | "ppv_purchased"
  | "tip_sent"
  | "payout_sent"
  | "film_viewed"
  | "film_viewed_70pct"
  | "film_viewed_100pct"
  | "subscription_started"
  | "subscription_canceled"
  | "age_verified"
  | "dmca_filed";

let posthogClient: unknown = null;
let posthogInitTried = false;

async function getPostHog(): Promise<unknown> {
  if (posthogClient) return posthogClient;
  if (posthogInitTried) return null;
  posthogInitTried = true;

  const key = process.env.POSTHOG_API_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  try {
    // @ts-expect-error — optional dep
    const mod = await import("posthog-node").catch(() => null);
    if (!mod) return null;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.posthog.com";
    const PH = (mod as { PostHog: new (k: string, o: { host: string }) => unknown }).PostHog;
    posthogClient = new PH(key, { host });
    return posthogClient;
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget product event. Always returns quickly even if PostHog
 * is missing or slow. Pass userId="anonymous" for unauthenticated events.
 */
export async function trackEvent(
  userId: string,
  event: ProductEvent,
  properties: Record<string, unknown> = {}
): Promise<void> {
  const client = await getPostHog();
  if (!client) return;
  try {
    // @ts-expect-error — dynamic shape
    client.capture({ distinctId: userId, event, properties });
  } catch {
    /* ignore */
  }
}

/**
 * Tie an anonymous distinct_id to a user id after signup/login. Lets
 * PostHog stitch the session pre-signup into the user profile.
 */
export async function identifyUser(
  userId: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  const client = await getPostHog();
  if (!client) return;
  try {
    // @ts-expect-error — dynamic shape
    client.identify({ distinctId: userId, properties });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Timing helpers — useful for long-running workflows (agent, render)
// ---------------------------------------------------------------------------

/**
 * Measure how long `fn` takes and push it to PostHog under a timing event.
 * Returns whatever `fn` returned.
 */
export async function withTiming<T>(
  userId: string,
  event: ProductEvent,
  fn: () => Promise<T>,
  extraProps: Record<string, unknown> = {}
): Promise<T> {
  const started = Date.now();
  try {
    const out = await fn();
    trackEvent(userId, event, {
      ...extraProps,
      durationMs: Date.now() - started,
      outcome: "success",
    }).catch(() => {});
    return out;
  } catch (err) {
    trackEvent(userId, event, {
      ...extraProps,
      durationMs: Date.now() - started,
      outcome: "error",
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Flush — call during graceful shutdown so we don't lose in-flight events
// ---------------------------------------------------------------------------

export async function flushObservability(): Promise<void> {
  const client = await getPostHog();
  if (!client) return;
  try {
    // @ts-expect-error
    await client.shutdownAsync?.();
  } catch {
    /* ignore */
  }
}
