/**
 * AiFlex cron runner (V7 §17 #31, V8 §A9).
 *
 * Runs a long-lived Node process on the VPS that triggers the HTTP cron
 * endpoints on a schedule. Uses `node-cron` (install: `npm i -D node-cron`).
 *
 * Usage:
 *   CRON_SECRET=... APP_URL=https://aiflex.app npm run cron
 *
 * Why HTTP endpoints rather than direct DB calls:
 *  - Keeps the cron process thin — no Prisma, no build step needed
 *  - Lets us replay a cron manually via curl
 *  - Same secret covers local dev and production
 *
 * Schedule:
 *  - every 5 min           → /api/agent/cron-check     (launch scheduled jobs, poll generating)
 *  - 1st of month, 00:05   → /api/payouts/run          (monthly creator payouts)
 *  - monday 09:00          → /api/series/publish-scheduled (weekly episode release)  [TODO route]
 *  - daily 02:00           → /api/analytics/aggregate  (daily film stats)              [TODO route]
 *
 * All env vars are required:
 *   CRON_SECRET   — shared secret, matches the endpoint expectation
 *   APP_URL       — base URL of the running app (e.g. http://localhost:3000)
 */

import cron from "node-cron";

const APP_URL = process.env.APP_URL || "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  // eslint-disable-next-line no-console
  console.error("[cron] CRON_SECRET is required. Aborting.");
  process.exit(1);
}

async function hit(path: string, label: string): Promise<void> {
  const url = `${APP_URL}${path}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET!, "content-type": "application/json" },
      body: "{}",
    });
    const body = await res.text();
    const ms = Date.now() - started;
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(`[cron] ${label} FAIL ${res.status} in ${ms}ms — ${body.slice(0, 200)}`);
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[cron] ${label} OK ${res.status} in ${ms}ms — ${body.slice(0, 200)}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[cron] ${label} threw:`, err);
  }
}

// Every 5 minutes — advance generation jobs
cron.schedule("*/5 * * * *", () => hit("/api/agent/cron-check", "agent-check"));

// 1st of each month at 00:05 UTC — monthly payouts for the previous month
cron.schedule("5 0 1 * *", () => hit("/api/payouts/run", "monthly-payouts"), {
  timezone: "UTC",
});

// Every Monday at 09:00 UTC — publish the weekly series episode
cron.schedule(
  "0 9 * * 1",
  () => hit("/api/series/publish-scheduled", "weekly-series"),
  { timezone: "UTC" }
);

// Every day at 02:00 UTC — aggregate daily film stats
cron.schedule(
  "0 2 * * *",
  () => hit("/api/analytics/aggregate", "daily-stats"),
  { timezone: "UTC" }
);

// Every Sunday at 03:30 UTC — purge expired logs (V8 §26.4 retention windows)
cron.schedule(
  "30 3 * * 0",
  () => hit("/api/admin/retention-purge", "retention-purge"),
  { timezone: "UTC" }
);

// Every Monday at 04:00 UTC — finalize A/B thumbnail tests > 7 days old
cron.schedule(
  "0 4 * * 1",
  () => hit("/api/thumbnails/resolve", "thumbnails-resolve"),
  { timezone: "UTC" }
);

// Every day at 09:00 UTC — onboarding + reactivation + monthly recap
// (recap auto-skipped except on 1st of month). V8 §27.4
cron.schedule(
  "0 9 * * *",
  () => hit("/api/cron/email-auto", "email-auto"),
  { timezone: "UTC" }
);

// Every Monday at 10:00 UTC — weekly Kids recap to parents (V8 §22.2)
cron.schedule(
  "0 10 * * 1",
  () => hit("/api/cron/parental-recap", "parental-recap"),
  { timezone: "UTC" }
);

// eslint-disable-next-line no-console
console.log(`[cron] started, targeting ${APP_URL}`);

// Keep the process alive; node-cron uses setTimeout internally
process.on("SIGINT", () => {
  // eslint-disable-next-line no-console
  console.log("[cron] SIGINT — shutting down");
  process.exit(0);
});
