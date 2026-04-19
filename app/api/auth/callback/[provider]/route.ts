import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGoogleCode, exchangeGithubCode, exchangeAppleCode } from "@/lib/oauth";
import { findUserByOAuth, findUserByEmail, createUser } from "@/lib/server-db";
import { startSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = req.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_missing_params`);
  }

  // Verify state token (name matches the one set at /api/auth/oauth/*).
  const isProd = process.env.NODE_ENV === "production";
  const stateName = isProd ? "__Host-oauth_state" : "oauth_state";
  const pkceName = isProd ? "__Host-oauth_pkce" : "oauth_pkce";
  const cookieStore = await cookies();
  const savedState = cookieStore.get(stateName)?.value;
  const pkceVerifier = cookieStore.get(pkceName)?.value;
  cookieStore.delete(stateName);
  cookieStore.delete(pkceName);

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_state_mismatch`);
  }

  try {
    // Exchange code for user info. Providers are required to confirm that
    // the email is verified on their side — we never trust an unverified
    // email, otherwise a malicious user can claim any address at their
    // IdP and end up linked to another user's account.
    let userInfo: {
      email: string;
      name: string;
      id: string;
      emailVerified: boolean;
    };

    if (provider === "google") {
      userInfo = await exchangeGoogleCode(code, pkceVerifier);
    } else if (provider === "github") {
      userInfo = await exchangeGithubCode(code);
    } else if (provider === "apple") {
      userInfo = await exchangeAppleCode(code);
    } else {
      return NextResponse.redirect(`${baseUrl}/login?error=oauth_invalid_provider`);
    }

    if (!userInfo.emailVerified) {
      return NextResponse.redirect(`${baseUrl}/login?error=oauth_email_unverified`);
    }

    // 1) Exact OAuth identity match — safe: we minted that link ourselves.
    let user = await findUserByOAuth(provider, userInfo.id);

    if (!user) {
      // 2) A local account already exists for that email. We do NOT auto-link:
      //    auto-linking on email parity is a textbook OAuth account-takeover
      //    vector (cf. GitHub "CWE-304", Microsoft's Nov-2023 advisory).
      //    Instead, redirect the user back to login and tell them to sign in
      //    the original way first, then link the provider from their settings.
      const existing = await findUserByEmail(userInfo.email);
      if (existing) {
        return NextResponse.redirect(
          `${baseUrl}/login?error=oauth_email_in_use&provider=${provider}`
        );
      }

      // 3) Fresh user — create account tied to verified OAuth identity.
      const { randomBytes } = await import("node:crypto");
      const randomPass = randomBytes(32).toString("hex");
      user = await createUser({
        email: userInfo.email.toLowerCase().trim(),
        name: userInfo.name,
        passwordHash: await hashPassword(randomPass),
        avatarSeed: userInfo.email,
        oauthProvider: provider as "google" | "github" | "apple",
        oauthId: userInfo.id,
        emailVerified: true,
        emailVerifiedAt: Date.now(),
      });
    }

    // Create session
    await startSession(user.id);

    return NextResponse.redirect(`${baseUrl}/dashboard`);
  } catch (err) {
    const { log } = await import("@/lib/logger");
    log.error("oauth.callback failed", err, { provider });
    return NextResponse.redirect(`${baseUrl}/login?error=oauth_exchange_failed`);
  }
}
