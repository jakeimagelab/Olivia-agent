import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();

  const { data } = await supabase
    .from("share_links")
    .select("id, feature_path, expires_at, revoked_at, use_count")
    .eq("token", token)
    .maybeSingle();

  const expired = !!data?.expires_at && new Date(data.expires_at) < new Date();
  if (!data || data.revoked_at || expired) {
    return NextResponse.redirect(new URL("/s/invalid", req.url));
  }

  await supabase
    .from("share_links")
    .update({ last_used_at: new Date().toISOString(), use_count: (data.use_count ?? 0) + 1 })
    .eq("id", data.id);

  const res = NextResponse.redirect(new URL(data.feature_path, req.url));
  res.cookies.set("pc_share_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  // 실제 인가는 pc_share_token 검증에서만 일어난다 — 이 쿠키는 클라이언트가
  // 자신의 허용 범위를 알기 위한 값(feature_path)만 담는다.
  res.cookies.set("pc_share_scope", data.feature_path, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
