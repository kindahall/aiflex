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
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

// ---------------------------------------------------------------------------
// Google OAuth
// ---------------------------------------------------------------------------

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${baseUrl()}/api/auth/callback/google`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(
  code: string
): Promise<{ email: string; name: string; id: string }> {
  // Exchange authorization code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${baseUrl()}/api/auth/callback/google`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    id_token?: string;
  };

  // Fetch user info
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    throw new Error("Failed to fetch Google user info");
  }

  const profile = (await userRes.json()) as {
    id: string;
    email: string;
    name: string;
  };

  return { email: profile.email, name: profile.name, id: profile.id };
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
): Promise<{ email: string; name: string; id: string }> {
  // Exchange code for access token
  const tokenRes = await fetch(
    "https://github.com/login/oauth/access_token",
    {
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
    }
  );

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

  // If email is private, fetch from /user/emails
  let email = profile.email;
  if (!email) {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });
    if (emailRes.ok) {
      const emails = (await emailRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary = emails.find((e) => e.primary && e.verified);
      email = primary?.email || emails[0]?.email || null;
    }
  }

  if (!email) {
    throw new Error("Could not retrieve email from GitHub");
  }

  return {
    email,
    name: profile.name || profile.login,
    id: String(profile.id),
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
  const pemBody = APPLE_PRIVATE_KEY
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
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
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      enc.encode(signingInput)
    )
  );

  return `${signingInput}.${base64url(signature)}`;
}

export async function exchangeAppleCode(
  code: string
): Promise<{ email: string; name: string; id: string }> {
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

  // Decode the id_token JWT (we don't verify sig here; Apple just issued it)
  const parts = tokens.id_token.split(".");
  const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));

  const email = payload.email as string;
  const sub = payload.sub as string;

  if (!email) {
    throw new Error("Could not retrieve email from Apple");
  }

  return {
    email,
    name: email.split("@")[0], // Apple may not provide name after first auth
    id: sub,
  };
}
