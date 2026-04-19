import { NextResponse } from "next/server";
import { captureException } from "@/lib/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Size caps to prevent log-injection + Sentry quota exhaustion. The middleware
// already rate-limits this as `api` (60/min/IP); we cap payload size here.
const MAX_FIELD_LEN = 2000;
const MAX_BODY_BYTES = 32 * 1024;

function clamp(v: unknown, max = MAX_FIELD_LEN): string {
  if (typeof v !== "string") return "";
  const stripped = v.replace(/[\u0000-\u001f\u007f]/g, " "); // strip control chars
  return stripped.slice(0, max);
}

/**
 * Receives client-side error reports (e.g. from global-error.tsx) and
 * forwards them to Sentry via the server-side integration. Payload is
 * strictly field-clamped to prevent log-injection via attacker-controlled
 * strings.
 */
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }
    const body = JSON.parse(raw) as {
      message?: unknown;
      name?: unknown;
      stack?: unknown;
      digest?: unknown;
    };
    const err = new Error(clamp(body.message) || "Unknown client error");
    err.name = clamp(body.name, 200) || "Error";
    const stack = clamp(body.stack, 8000);
    if (stack) err.stack = stack;

    await captureException(err, {
      source: "global-error-boundary",
      digest: clamp(body.digest, 200),
    });
  } catch {
    // Best effort — don't let reporting errors break anything.
  }

  return NextResponse.json({ ok: true });
}
