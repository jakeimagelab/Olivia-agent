import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId     = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const baseUrl      = process.env.NEXTAUTH_URL || "https://olivia-agent-smoky.vercel.app";
  const redirectUri  = baseUrl + "/api/auth/google/callback";

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(baseUrl + "/mailing?auth=error");
  }

  try {
    // 1. code → access_token 교환
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return NextResponse.redirect(baseUrl + "/mailing?auth=error");
    }

    // 2. 사용자 정보 가져오기
    const userRes  = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
    });
    const userInfo = await userRes.json();

    // 3. 세션 쿠키 저장 (access_token + user info)
    const sessionData = JSON.stringify({
      accessToken: tokenData.access_token,
      name:        userInfo.name || "",
      email:       userInfo.email || "",
      expiresAt:   Date.now() + (tokenData.expires_in || 3600) * 1000,
    });

    const res = NextResponse.redirect(baseUrl + "/delivery-mail?auth=success");
    res.cookies.set("pc_session", Buffer.from(sessionData).toString("base64"), {
      httpOnly: true,
      secure:   true,
      sameSite: "lax",
      maxAge:   3600,
      path:     "/",
    });

    return res;
  } catch (e: any) {
    return NextResponse.redirect(baseUrl + "/mailing?auth=error");
  }
}
