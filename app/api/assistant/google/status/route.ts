import { NextRequest, NextResponse } from "next/server";
import { ensurePrimaryAssistantOwner } from "@/lib/assistant/owners/service";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json(
      { ok: false, error: "관리자 로그인이 필요합니다." },
      { status: 401 },
    );
  }
  try {
    const db = getSupabaseAdmin();
    const owner = await ensurePrimaryAssistantOwner(db);
    const { data, error } = await db
      .from("assistant_oauth_credentials")
      .select("account_email,status,scopes,connected_at,last_refreshed_at")
      .eq("owner_id", owner.id)
      .eq("provider", "google")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({
      ok: true,
      connected: data?.status === "active",
      credential: data ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Google 연결 조회 실패",
      },
      { status: 500 },
    );
  }
}
