import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getGoogleAuthUrl, getGithubAuthUrl, getAppleAuthUrl } from "@/lib/oauth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  const supported = ["google", "github", "apple"];
  if (!supported.includes(provider)) {
    return NextResponse.json(
      { error: "Fournisseur OAuth non supporté" },
      { status: 400 }
    );
  }

  // Generate a random state token for CSRF protection
  const { randomBytes } = await import("node:crypto");
  const state = randomBytes(16).toString("hex");

  // Save state in a cookie for verification in the callback
  const cookieStore = await cookies();
  cookieStore.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10, // 10 minutes
  });

  let url: string;
  if (provider === "google") {
    url = getGoogleAuthUrl(state);
  } else if (provider === "github") {
    url = getGithubAuthUrl(state);
  } else {
    url = getAppleAuthUrl(state);
  }

  return NextResponse.redirect(url);
}
