import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGoogleCode, exchangeGithubCode, exchangeAppleCode } from "@/lib/oauth";
import {
  findUserByOAuth,
  findUserByEmail,
  createUser,
} from "@/lib/server-db";
import { startSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = req.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/login?error=oauth_denied`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}/login?error=oauth_missing_params`
    );
  }

  // Verify state token
  const cookieStore = await cookies();
  const savedState = cookieStore.get("oauth_state")?.value;
  cookieStore.delete("oauth_state");

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(
      `${baseUrl}/login?error=oauth_state_mismatch`
    );
  }

  try {
    // Exchange code for user info
    let userInfo: { email: string; name: string; id: string };

    if (provider === "google") {
      userInfo = await exchangeGoogleCode(code);
    } else if (provider === "github") {
      userInfo = await exchangeGithubCode(code);
    } else if (provider === "apple") {
      userInfo = await exchangeAppleCode(code);
    } else {
      return NextResponse.redirect(
        `${baseUrl}/login?error=oauth_invalid_provider`
      );
    }

    // Find existing user by OAuth ID, or by email, or create new
    let user = await findUserByOAuth(provider, userInfo.id);

    if (!user) {
      // Check if a user with this email already exists (link accounts)
      user = await findUserByEmail(userInfo.email);

      if (user) {
        // Link OAuth to existing account — update in-place via import
        const { updateUser } = await import("@/lib/server-db");
        await updateUser(user.id, {
          oauthProvider: provider as "google" | "github" | "apple",
          oauthId: userInfo.id,
          emailVerified: true,
          emailVerifiedAt: user.emailVerifiedAt || Date.now(),
        });
      } else {
        // Create a new user — OAuth users get a random password hash
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
    }

    // Create session
    await startSession(user.id);

    return NextResponse.redirect(`${baseUrl}/dashboard`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[OAuth callback error]", err);
    return NextResponse.redirect(
      `${baseUrl}/login?error=oauth_exchange_failed`
    );
  }
}
