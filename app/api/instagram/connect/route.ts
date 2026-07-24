import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const appId = process.env.META_APP_ID;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
  if (!appId) return NextResponse.json({ ok: false, error: "META_APP_ID가 설정되지 않았습니다." }, { status: 503 });
  const state = randomUUID();
  const version = process.env.META_GRAPH_API_VERSION || "v23.0";
  const redirectUri = `${baseUrl}/api/instagram/callback`;
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement");
  const response = NextResponse.redirect(url);
  response.cookies.set("instagram_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
