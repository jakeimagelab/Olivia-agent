import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // NEXTAUTH_URL이 실제 접속 도메인과 다를 수 있어(예: *.vercel.app) 요청이 들어온 호스트를 그대로 쓴다
  // — /drive/connect가 redirect_uri를 만들 때도 같은 방식을 쓰므로 두 값이 항상 일치한다.
  const baseUrl = req.nextUrl.origin;
  const settingsUrl = `${baseUrl}/admin/team-chat-settings`;

  if (req.cookies.get("pc_admin_session")?.value !== "active") {
    return NextResponse.redirect(`${settingsUrl}?drive=unauthorized`);
  }

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  if (error || !code) return NextResponse.redirect(`${settingsUrl}?drive=error`);

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = `${baseUrl}/api/team-chat/drive/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token || !tokenData.refresh_token) {
      // refresh_token이 없으면(이전에 이미 동의해서 재동의가 스킵된 경우 등) 재연결이 필요하다는 뜻.
      return NextResponse.redirect(`${settingsUrl}?drive=error`);
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userRes.json();

    const db = getSupabaseAdmin();
    await db.from("chat_drive_connection").upsert({
      id: 1,
      google_email: userInfo.email ?? null,
      refresh_token: tokenData.refresh_token,
      access_token: tokenData.access_token,
      access_token_expires_at: new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    return NextResponse.redirect(`${settingsUrl}?drive=success`);
  } catch {
    return NextResponse.redirect(`${settingsUrl}?drive=error`);
  }
}
