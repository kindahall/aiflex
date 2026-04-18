import { NextResponse } from "next/server";
import { captureException } from "@/lib/sentry";

/**
 * Receives client-side error reports (e.g. from global-error.tsx) and
 * forwards them to Sentry via the server-side integration.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const err = new Error(body.message || "Unknown client error");
    err.name = body.name || "Error";
    if (body.stack) err.stack = body.stack;

    await captureException(err, {
      source: "global-error-boundary",
      digest: body.digest,
    });
  } catch {
    // Best effort — don't let reporting errors break anything.
  }

  return NextResponse.json({ ok: true });
}
