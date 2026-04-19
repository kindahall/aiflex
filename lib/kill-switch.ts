import "server-only";

/**
 * Feature kill-switches, env-driven.
 *
 * Set `FEATURE_<NAME>_KILL=1` to disable that capability at runtime.
 * Useful as a panic button during an incident — e.g. an AI provider
 * billing runaway or a CSAM scare: flip the switch, redeploy-free.
 *
 * Current switches:
 *   FEATURE_UPLOADS_KILL        — refuses new file uploads
 *   FEATURE_GENERATION_KILL     — refuses new agent/generation jobs
 *   FEATURE_PAYOUTS_KILL        — skips the creator-payout cron
 *   FEATURE_TIPS_KILL           — refuses new tip checkouts
 *   FEATURE_SIGNUPS_KILL        — refuses new account creation
 *   FEATURE_COMMENTS_KILL       — refuses new comments
 */

export type KillSwitch = "uploads" | "generation" | "payouts" | "tips" | "signups" | "comments";

export function isKilled(feature: KillSwitch): boolean {
  const v = process.env[`FEATURE_${feature.toUpperCase()}_KILL`];
  return v === "1" || v === "true";
}

/**
 * Throw-style helper for request handlers. Call at the top of the
 * handler; if the switch is live we return a 503-style error.
 */
export function assertFeatureEnabled(feature: KillSwitch): void {
  if (isKilled(feature)) {
    const err = new Error(
      `Fonctionnalité "${feature}" temporairement désactivée par l'équipe AIflex.`
    );
    (err as Error & { status?: number }).status = 503;
    throw err;
  }
}
