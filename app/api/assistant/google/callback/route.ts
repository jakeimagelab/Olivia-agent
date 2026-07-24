import { NextRequest, NextResponse } from "next/server";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { encryptAssistantSecret } from "@/lib/assistant/security";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    req.nextUrl.origin;
  const resultUrl = new URL("/admin/kakao-assistant", baseUrl);
  if (!isAdminSession(req)) {
    resultUrl.searchParams.set("google", "unauthorized");
    return NextResponse.redirect(resultUrl);
  }
  const state = req.nextUrl.searchParams.get("state");
  const storedState = req.cookies.get("assistant_google_oauth_state")?.value;
  const code = req.nextUrl.searchParams.get("code");
  if (!state || !storedState || state !== storedState || !code) {
    resultUrl.searchParams.set("google", "invalid_state");
    return NextResponse.redirect(resultUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    resultUrl.searchParams.set("google", "not_configured");
    return NextResponse.redirect(resultUrl);
  }
  try {
    const redirectUri = `${baseUrl}/api/assistant/google/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token || !token.refresh_token) {
      throw new Error("Google token exchange failed");
    }
    const userResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      },
    );
    const user = await userResponse.json();
    if (!userResponse.ok || !user.email) {
      throw new Error("Google user lookup failed");
    }
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const scopes = String(token.scope || "")
      .split(/\s+/)
      .filter(Boolean);
    const { error } = await db
      .from("assistant_oauth_credentials")
      .upsert(
        {
          owner_id: owner.id,
          provider: "google",
          account_email: String(user.email),
          encrypted_refresh_token: encryptAssistantSecret(
            token.refresh_token,
          ),
          encrypted_access_token: encryptAssistantSecret(token.access_token),
          access_token_expires_at: new Date(
            Date.now() + Number(token.expires_in || 3600) * 1_000,
          ).toISOString(),
          scopes,
          status: "active",
          connected_at: new Date().toISOString(),
          last_refreshed_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,provider" },
      );
    if (error) throw new Error(error.message);
    resultUrl.searchParams.set("google", "connected");
  } catch {
    resultUrl.searchParams.set("google", "error");
  }
  const response = NextResponse.redirect(resultUrl);
  response.cookies.delete("assistant_google_oauth_state");
  return response;
}
