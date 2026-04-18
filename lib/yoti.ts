import "server-only";
import crypto from "node:crypto";

/**
 * Yoti Identity Verification (IDV) integration (V8 §19.4).
 *
 * Real implementation talks to the Yoti REST API:
 *   POST /idverify/v1/sessions      → create a hosted verification session
 *   GET  /idverify/v1/sessions/{id} → poll status (we prefer webhooks)
 *
 * Yoti requires a Plugin SDK ID + a private key (PEM). The auth model is :
 *   1. Build a JSON body
 *   2. POST with header `X-Yoti-Auth-Digest: <base64-rsa-sha256-sig>`
 *   3. Yoti returns `{ session_id, client_session_token, ... }`
 *
 * For dev/test we expose the same surface but no-op when the API key is
 * missing — the route falls back to `self_declared` (see V8 §19.4 brief).
 *
 * The actual ID document scan happens client-side via Yoti's hosted page;
 * we just receive the session result via callback.
 */

const YOTI_BASE = "https://api.yoti.com/idverify/v1";

export interface YotiCreateSessionParams {
  /** AIflex user we're verifying (passed back via session.user_tracking_id). */
  userId: string;
  /** URL Yoti redirects the user to after completion. */
  successUrl: string;
  /** URL Yoti POSTs the result to. */
  callbackUrl: string;
  /** ISO-2 country override; defaults to FR. */
  country?: string;
}

export interface YotiSessionHandle {
  sessionId: string;
  clientSessionToken: string;
  hostedUrl: string;
}

export type YotiSessionState =
  | "ONGOING"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED"
  | "UNKNOWN";

export interface YotiSessionStatus {
  state: YotiSessionState;
  /** Verified once Yoti confirmed the user is over 18. */
  ageVerified: boolean;
  userTrackingId?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isYotiConfigured(): boolean {
  return Boolean(process.env.YOTI_API_KEY && process.env.YOTI_SDK_ID);
}

/**
 * Create a hosted Yoti session. Returns the URL the user is redirected to.
 * Throws when not configured — caller is expected to gate on
 * `isYotiConfigured()` and fall back to self-declaration.
 */
export async function createYotiSession(
  params: YotiCreateSessionParams
): Promise<YotiSessionHandle> {
  if (!isYotiConfigured()) {
    throw new Error("Yoti not configured");
  }

  const body = {
    session_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    user_tracking_id: params.userId,
    notifications: {
      endpoint: params.callbackUrl,
      topics: ["SESSION_COMPLETION", "FIRST_TASK_COMPLETION"],
      auth_token: process.env.YOTI_WEBHOOK_TOKEN ?? null,
    },
    requested_checks: [
      {
        type: "ID_DOCUMENT_AUTHENTICITY",
        config: {},
      },
      {
        type: "FACE_COMPARISON",
        config: { manual_check: "FALLBACK" },
      },
      {
        type: "ID_DOCUMENT_FACE_MATCH",
        config: {},
      },
    ],
    requested_tasks: [
      {
        type: "ID_DOCUMENT_TEXT_DATA_EXTRACTION",
        config: { manual_check: "FALLBACK" },
      },
    ],
    sdk_config: {
      success_url: params.successUrl,
      error_url: params.successUrl,
      allowed_capture_methods: "CAMERA_AND_UPLOAD",
    },
    required_documents: [
      {
        type: "ID_DOCUMENT",
        filter: {
          type: "DOCUMENT_RESTRICTIONS",
          inclusion: "INCLUDE",
          documents: [
            { country_codes: [params.country ?? "FR"], document_types: ["PASSPORT", "DRIVING_LICENCE", "NATIONAL_ID"] },
          ],
        },
      },
    ],
  };

  const url = `${YOTI_BASE}/sessions?sdkId=${encodeURIComponent(process.env.YOTI_SDK_ID!)}`;
  const json = JSON.stringify(body);
  const digest = signRsaSha256(json, process.env.YOTI_API_KEY!);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Yoti-Auth-Digest": digest,
      Accept: "application/json",
    },
    body: json,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yoti session create failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    session_id: string;
    client_session_token: string;
  };
  // The hosted page lives at https://api.yoti.com/idverify/v1/web/index.html?sessionID=...
  // Yoti gives us a token; the front-end SDK exchanges it for the rendered
  // page. For server-side redirect we use the production hosted URL.
  const hostedUrl = `https://api.yoti.com/idverify/v1/web/index.html?sessionID=${data.session_id}&sessionToken=${data.client_session_token}`;
  return {
    sessionId: data.session_id,
    clientSessionToken: data.client_session_token,
    hostedUrl,
  };
}

/**
 * Fetch the current state of a Yoti session. Used both by polling (when
 * we don't trust the webhook to arrive) and by the callback handler to
 * confirm the result before flipping `User.ageVerified = "verified"`.
 */
export async function getYotiSessionStatus(
  sessionId: string
): Promise<YotiSessionStatus> {
  if (!isYotiConfigured()) {
    return { state: "UNKNOWN", ageVerified: false };
  }
  const url = `${YOTI_BASE}/sessions/${encodeURIComponent(sessionId)}?sdkId=${encodeURIComponent(process.env.YOTI_SDK_ID!)}`;
  // GET requests need a digest of the empty string per Yoti spec
  const digest = signRsaSha256("", process.env.YOTI_API_KEY!);
  const res = await fetch(url, {
    headers: {
      "X-Yoti-Auth-Digest": digest,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    return { state: "UNKNOWN", ageVerified: false };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  const state: YotiSessionState =
    data.state === "COMPLETED"
      ? "COMPLETED"
      : data.state === "ONGOING"
        ? "ONGOING"
        : data.state === "FAILED"
          ? "FAILED"
          : "EXPIRED";
  // The age verification result is nested under
  // session.resources.id_documents[0].extracted.estimated_age_over_18
  // OR via a dedicated AGE_OVER:18 check. We accept any positive signal.
  let ageVerified = false;
  try {
    const checks = data?.checks as Array<{
      type: string;
      report?: { recommendation?: { value?: string } };
    }>;
    const ageCheck = checks?.find(
      (c) => c.type === "AGE_OVER" || c.type === "DOCUMENT_AUTHENTICITY"
    );
    if (ageCheck?.report?.recommendation?.value === "APPROVE") {
      ageVerified = true;
    }
  } catch {
    /* no-op */
  }
  return {
    state,
    ageVerified,
    userTrackingId: data?.user_tracking_id,
  };
}

// ---------------------------------------------------------------------------
// Auth digest helper — Yoti uses RSA-SHA256 over the full request body
// ---------------------------------------------------------------------------

function signRsaSha256(payload: string, privateKeyPem: string): string {
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(payload);
  sign.end();
  const sig = sign.sign(privateKeyPem);
  return sig.toString("base64");
}
