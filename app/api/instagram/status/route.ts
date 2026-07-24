import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getInstagramCredentials, verifyInstagramAccount } from "@/lib/instagram/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const credentials = await getInstagramCredentials(getSupabaseAdmin());
    if (!credentials) {
      return NextResponse.json({
        ok: true,
        connected: false,
        configured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
      });
    }
    const account = await verifyInstagramAccount(credentials);
    return NextResponse.json({
      ok: true,
      connected: true,
      account: { id: account.id, username: account.username || credentials.username },
    });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      connected: false,
      error: error instanceof Error ? error.message : "Instagram 연결 확인 실패",
    });
  }
}
