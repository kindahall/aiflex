import "server-only";

/**
 * Lightweight Sentry integration using the envelope API (no SDK needed).
 * Reads SENTRY_DSN and SENTRY_ENVIRONMENT from env vars.
 * Gracefully no-ops if SENTRY_DSN is not configured.
 */

interface SentryConfig {
  publicKey: string;
  projectId: string;
  host: string;
}

function parseDsn(dsn: string): SentryConfig | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace("/", "");
    const host = url.host;
    if (!publicKey || !projectId || !host) return null;
    return { publicKey, projectId, host };
  } catch {
    // eslint-disable-next-line no-console
    console.warn("[sentry] Invalid SENTRY_DSN, skipping.");
    return null;
  }
}

function getConfig(): SentryConfig | null {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;
  return parseDsn(dsn);
}

function buildEnvelope(
  config: SentryConfig,
  event: Record<string, unknown>
): string {
  const envelopeHeader = JSON.stringify({
    event_id: crypto.randomUUID().replace(/-/g, ""),
    dsn: process.env.SENTRY_DSN,
  });
  const itemHeader = JSON.stringify({
    type: "event",
    content_type: "application/json",
  });
  const itemPayload = JSON.stringify(event);
  return `${envelopeHeader}\n${itemHeader}\n${itemPayload}`;
}

async function sendEnvelope(
  config: SentryConfig,
  event: Record<string, unknown>
): Promise<void> {
  const envelope = buildEnvelope(config, event);
  const url = `https://${config.host}/api/${config.projectId}/envelope/`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=aiflex-node/1.0, sentry_key=${config.publicKey}`,
      },
      body: envelope,
    });

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[sentry] API error ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[sentry] Failed to send event:", err);
  }
}

/**
 * Report an exception to Sentry. No-ops when SENTRY_DSN is absent.
 */
export async function captureException(
  error: unknown,
  context?: Record<string, unknown>
): Promise<void> {
  const config = getConfig();
  if (!config) return;

  const err =
    error instanceof Error
      ? error
      : new Error(String(error));

  const event: Record<string, unknown> = {
    platform: "node",
    level: "error",
    environment: process.env.SENTRY_ENVIRONMENT || "production",
    timestamp: Date.now() / 1000,
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: err.stack
            ? {
                frames: err.stack
                  .split("\n")
                  .slice(1)
                  .map((line) => ({ value: line.trim() })),
              }
            : undefined,
        },
      ],
    },
    ...(context ? { extra: context } : {}),
  };

  await sendEnvelope(config, event);
}

/**
 * Send a message event to Sentry. No-ops when SENTRY_DSN is absent.
 */
export async function captureMessage(
  message: string,
  level: "fatal" | "error" | "warning" | "info" | "debug" = "info"
): Promise<void> {
  const config = getConfig();
  if (!config) return;

  const event: Record<string, unknown> = {
    platform: "node",
    level,
    environment: process.env.SENTRY_ENVIRONMENT || "production",
    timestamp: Date.now() / 1000,
    message: { formatted: message },
  };

  await sendEnvelope(config, event);
}
