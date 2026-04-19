import "server-only";
import { log } from "./logger";

/**
 * Lightweight tracing primitives — span / event APIs that emit
 * structured JSON so a downstream collector (OpenTelemetry exporter,
 * Datadog agent, custom Loki pipeline) can pick them up. No hard
 * dependency on `@opentelemetry/*` so we don't bloat the bundle.
 *
 * Each span emits two events:
 *   {kind:"span.start", name, traceId, spanId, parentSpanId, attrs}
 *   {kind:"span.end",   name, traceId, spanId, durationMs, status}
 *
 * Migrate to OTel later by swapping the implementation here — call
 * sites stay the same.
 */

import { randomBytes } from "node:crypto";

export interface Span {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  setAttr(key: string, value: string | number | boolean): void;
  end(status?: "ok" | "error", err?: unknown): void;
}

function newId(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

class SpanImpl implements Span {
  private startedAt: number = Date.now();
  private attrs: Record<string, string | number | boolean> = {};
  constructor(
    public name: string,
    public traceId: string,
    public spanId: string,
    public parentSpanId?: string
  ) {
    log.debug("span.start", {
      kind: "span.start",
      name: this.name,
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
    });
  }
  setAttr(key: string, value: string | number | boolean): void {
    this.attrs[key] = value;
  }
  end(status: "ok" | "error" = "ok", err?: unknown): void {
    const durationMs = Date.now() - this.startedAt;
    if (status === "error") {
      log.warn("span.end", {
        kind: "span.end",
        name: this.name,
        traceId: this.traceId,
        spanId: this.spanId,
        durationMs,
        status,
        attrs: this.attrs,
        err: err instanceof Error ? { message: err.message, name: err.name } : err,
      });
    } else {
      log.info("span.end", {
        kind: "span.end",
        name: this.name,
        traceId: this.traceId,
        spanId: this.spanId,
        durationMs,
        status,
        attrs: this.attrs,
      });
    }
  }
}

export function startSpan(name: string, parent?: Span): Span {
  return new SpanImpl(name, parent?.traceId ?? newId(16), newId(8), parent?.spanId);
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  parent?: Span
): Promise<T> {
  const span = startSpan(name, parent);
  try {
    const out = await fn(span);
    span.end("ok");
    return out;
  } catch (err) {
    span.end("error", err);
    throw err;
  }
}
