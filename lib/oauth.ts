import "server-only";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || "";
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "";
const APPLE_KEY_ID = process.env.APPLE_KEY_ID || "";
const APPLE_PRIVATE_KEY = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL;
  if (configured) {
    try {
      const u = new URL(configured);
      if (u.protocol === "http:" || u.protocol === "https:") return u.origin;
    } catch {
      /* fall through */
    }
  }
  // VERCEL_URL is attacker-influenceable in some preview environments
  // (branch name → hostname). Only accept it when it matches the
  // expected .vercel.app suffix.
  const v = process.env.VERCEL_URL;
  if (v && /^[A-Za-z0-9.-]+\.vercel\.app$/.test(v)) {
    return `https://${v}`;
  }
  return "http://localhost:3000";
}

// ---------------------------------------------------------------------------
// Google OAuth
// ---------------------------------------------------------------------------

export function getGoogleAuthUrl(state: string, codeChallenge?: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${baseUrl()}/api/auth/callback/google`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });
  if (codeChallenge) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(
  code: string,
  codeVerifier?: string
): Promise<{ email: string; name: string; id: string; emailVerified: boolean }> {
  // Exchange authorization code for tokens
  const body: Record<string, string> = {
    code,
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: `${baseUrl()}/api/auth/callback/google`,
    grant_type: "authorization_code",
  };
  if (codeVerifier) body.code_verifier = codeVerifier;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    id_token?: string;
  };

  // Fetch user info — the v3 endpoint includes `email_verified`.
  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    throw new Error("Failed to fetch Google user info");
  }

  const profile = (await userRes.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
  };

  return {
    email: profile.email,
    name: profile.name || profile.email.split("@")[0],
    id: profile.sub,
    emailVerified: profile.email_verified === true,
  };
}

// ---------------------------------------------------------------------------
// GitHub OAuth
// ---------------------------------------------------------------------------

export function getGithubAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: `${baseUrl()}/api/auth/callback/github`,
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGithubCode(
  code: string
): Promise<{ email: string; name: string; id: string; emailVerified: boolean }> {
  // Exchange code for access token
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${baseUrl()}/api/auth/callback/github`,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error("GitHub token exchange failed");
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    error?: string;
  };

  if (tokenData.error) {
    throw new Error(`GitHub OAuth error: ${tokenData.error}`);
  }

  // Fetch user profile
  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
    },
  });

  if (!userRes.ok) {
    throw new Error("Failed to fetch GitHub user info");
  }

  const profile = (await userRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
  };

  // Always pull /user/emails so we can enforce `primary && verified`. The
  // profile.email field from /user bypasses the verification flag and is
  // NOT safe to trust on its own (OAuth takeover vector).
  const emailRes = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
    },
  });
  if (!emailRes.ok) {
    throw new Error("Could not retrieve GitHub emails (missing user:email scope?)");
  }
  const emails = (await emailRes.json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;
  const primary = emails.find((e) => e.primary && e.verified);
  if (!primary) {
    throw new Error("GitHub account has no verified primary email");
  }

  return {
    email: primary.email,
    name: profile.name || profile.login,
    id: String(profile.id),
    emailVerified: true,
  };
}

// ---------------------------------------------------------------------------
// Apple OAuth (Sign in with Apple)
// ---------------------------------------------------------------------------

export function getAppleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: APPLE_CLIENT_ID,
    redirect_uri: `${baseUrl()}/api/auth/callback/apple`,
    response_type: "code id_token",
    scope: "name email",
    state,
    response_mode: "form_post",
  });
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}

/**
 * Generate a client_secret JWT for Apple OAuth.
 * Apple requires a signed JWT as the client_secret.
 */
async function generateAppleClientSecret(): Promise<string> {
  const header = { alg: "ES256", kid: APPLE_KEY_ID };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: APPLE_TEAM_ID,
    iat: now,
    exp: now + 15777000, // ~6 months
    aud: "https://appleid.apple.com",
    sub: APPLE_CLIENT_ID,
  };

  const enc = new TextEncoder();

  function base64url(data: Uint8Array | string): string {
    const bytes = typeof data === "string" ? enc.encode(data) : data;
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import the PEM private key
  const pemBody = APPLE_PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput))
  );

  return `${signingInput}.${base64url(signature)}`;
}

// ---------------------------------------------------------------------------
// Apple JWKS cache + ES256 signature verification
// ---------------------------------------------------------------------------

interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

let appleJwksCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;
const APPLE_JWKS_TTL_MS = 60 * 60 * 1000; // 1h

async function getAppleJwks(): Promise<AppleJwk[]> {
  if (appleJwksCache && Date.now() - appleJwksCache.fetchedAt < APPLE_JWKS_TTL_MS) {
    return appleJwksCache.keys;
  }
  const { timedFetch } = await import("./safe-outbound");
  const res = await timedFetch("https://appleid.apple.com/auth/keys", {
    timeoutMs: 10_000,
    retry: { attempts: 3, baseMs: 500 },
  });
  if (!res.ok) throw new Error("Apple JWKS fetch failed");
  const data = (await res.json()) as { keys: AppleJwk[] };
  appleJwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4;
  const padded = pad ? s + "=".repeat(4 - pad) : s;
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifyAppleIdToken(idToken: string): Promise<{
  email: string;
  sub: string;
  emailVerified: boolean;
}> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Apple id_token malformed");
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(headerB64))) as {
    alg: string;
    kid: string;
  };
  if (header.alg !== "RS256") {
    throw new Error(`Unexpected Apple id_token alg: ${header.alg}`);
  }

  const jwks = await getAppleJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Apple id_token kid not found in JWKS");

  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: "RS256",
      ext: true,
    } as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = b64urlDecode(sigB64);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, signed);
  if (!ok) throw new Error("Apple id_token signature invalid");

  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as {
    iss?: string;
    aud?: string;
    exp?: number;
    nbf?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean | "true" | "false";
    is_private_email?: boolean | "true" | "false";
  };

  if (payload.iss !== "https://appleid.apple.com") {
    throw new Error("Apple id_token iss mismatch");
  }
  if (payload.aud !== APPLE_CLIENT_ID) {
    throw new Error("Apple id_token aud mismatch");
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now - 30) {
    throw new Error("Apple id_token expired");
  }
  if (payload.nbf && payload.nbf > now + 30) {
    throw new Error("Apple id_token not yet valid");
  }
  if (!payload.sub || !payload.email) {
    throw new Error("Apple id_token missing sub or email");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
  };
}

export async function exchangeAppleCode(
  code: string
): Promise<{ email: string; name: string; id: string; emailVerified: boolean }> {
  const clientSecret = await generateAppleClientSecret();

  const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: APPLE_CLIENT_ID,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${baseUrl()}/api/auth/callback/apple`,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Apple token exchange failed: ${err}`);
  }

  const tokens = (await tokenRes.json()) as { id_token: string };

  // Full cryptographic verification — iss, aud, exp, and RS256 signature
  // against Apple's published JWKS. Required by the OIDC spec; without
  // this, an attacker able to supply an id_token (MITM or forged) can
  // impersonate any Apple user.
  const verified = await verifyAppleIdToken(tokens.id_token);

  return {
    email: verified.email,
    name: verified.email.split("@")[0],
    id: verified.sub,
    emailVerified: verified.emailVerified,
  };
}
