import "server-only";

/**
 * Lightweight structured logger. Outputs single-line JSON in production
 * (digestible by Datadog / Loki / CloudWatch / ELK without a parser
 * plugin) and pretty-printed strings in development for readability.
 *
 * Usage:
 *   log.info("payout completed", { userId, amountCents });
 *   log.warn("moderation bypass", { route, reason });
 *   log.error("stripe refund failed", err, { chargeId });
 *
 * Rationale (audit L-08): ad-hoc `console.log` calls scattered across the
 * codebase can't be ingested by a SIEM. Centralising through `log.*` lets
 * ops pipe one JSON stream to its sink and grep on field keys.
 */

type Level = "debug" | "info" | "warn" | "error";

function serializeError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    return {
      name: e.name,
      message: e.message,
      stack: e.stack,
      // Preserve Error.cause if present (not enumerable by default).
      cause: (e as { cause?: unknown }).cause,
    };
  }
  return { value: e };
}

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const isProd = process.env.NODE_ENV === "production";
  const record = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...(ctx || {}),
  };
  // eslint-disable-next-line no-console
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (isProd) {
    try {
      fn(JSON.stringify(record));
    } catch {
      // Circular / non-serializable — fall back to util.inspect.
      fn(`[${level}] ${msg}`);
    }
  } else {
    fn(`[${level}] ${msg}`, ctx ?? "");
  }
}

export const log = {
  debug(msg: string, ctx?: Record<string, unknown>) {
    if (process.env.LOG_LEVEL === "debug" || process.env.NODE_ENV !== "production") {
      emit("debug", msg, ctx);
    }
  },
  info(msg: string, ctx?: Record<string, unknown>) {
    emit("info", msg, ctx);
  },
  warn(msg: string, ctx?: Record<string, unknown>) {
    emit("warn", msg, ctx);
  },
  error(msg: string, err?: unknown, ctx?: Record<string, unknown>) {
    emit("error", msg, { ...(ctx || {}), err: err ? serializeError(err) : undefined });
  },
};
