import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { encryptInstagramToken } from "@/lib/instagram/tokenCrypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;
  const fail = (message: string) => NextResponse.redirect(`${baseUrl}/review-studio?instagramError=${encodeURIComponent(message)}`);
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  if (!state || state !== req.cookies.get("instagram_oauth_state")?.value || !code) return fail("Instagram 인증 요청이 만료되었습니다.");
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return fail("Meta 앱 환경변수가 설정되지 않았습니다.");

  try {
    const version = process.env.META_GRAPH_API_VERSION || "v23.0";
    const redirectUri = `${baseUrl}/api/instagram/callback`;
    const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    const tokenResponse = await fetch(tokenUrl, { signal: AbortSignal.timeout(30_000) });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error?.message || "Meta 토큰 교환 실패");

    const accountsUrl = new URL(`https://graph.facebook.com/${version}/me/accounts`);
    accountsUrl.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
    accountsUrl.searchParams.set("access_token", tokenData.access_token);
    const accountsResponse = await fetch(accountsUrl, { signal: AbortSignal.timeout(30_000) });
    const accountsData = await accountsResponse.json();
    const page = (accountsData.data || []).find((item: any) => item.instagram_business_account?.id && item.access_token);
    if (!page) throw new Error("연결 가능한 Professional Instagram 계정을 찾지 못했습니다.");

    const encrypted = encryptInstagramToken(page.access_token);
    await getSupabaseAdmin().from("instagram_accounts").upsert({
      ig_user_id: page.instagram_business_account.id,
      username: page.instagram_business_account.username || page.name || "",
      token_ciphertext: encrypted.ciphertext,
      token_iv: encrypted.iv,
      token_tag: encrypted.tag,
      token_expires_at: tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString() : null,
      status: "connected",
      connected_by: "owner",
    }, { onConflict: "ig_user_id" });
    const response = NextResponse.redirect(`${baseUrl}/review-studio?instagramConnected=1`);
    response.cookies.delete("instagram_oauth_state");
    return response;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Instagram 연결 실패");
  }
}
