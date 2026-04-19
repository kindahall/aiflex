import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { getGoogleAuthUrl, getGithubAuthUrl, getAppleAuthUrl } from "@/lib/oauth";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  const supported = ["google", "github", "apple"];
  if (!supported.includes(provider)) {
    return NextResponse.json({ error: "Fournisseur OAuth non supporté" }, { status: 400 });
  }

  const state = randomBytes(16).toString("hex");

  // PKCE (RFC 7636). Required to protect against code-injection / code
  // interception attacks, and now mandatory on Google OAuth per their
  // 2024 migration.
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());

  // State + PKCE cookies are very short-lived (10 minutes) so we can
  // set Secure unconditionally — matches OAuth 2.1 guidance.
  // In dev over http://localhost, browsers accept Secure on localhost.
  const isProd = process.env.NODE_ENV === "production";
  const cookieStore = await cookies();
  const common = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: true,
    maxAge: 60 * 10,
  };
  const stateName = isProd ? "__Host-oauth_state" : "oauth_state";
  const pkceName = isProd ? "__Host-oauth_pkce" : "oauth_pkce";
  cookieStore.set(stateName, state, common);
  cookieStore.set(pkceName, verifier, common);

  let url: string;
  if (provider === "google") {
    url = getGoogleAuthUrl(state, challenge);
  } else if (provider === "github") {
    url = getGithubAuthUrl(state);
  } else {
    url = getAppleAuthUrl(state);
  }

  return NextResponse.redirect(url);
}
