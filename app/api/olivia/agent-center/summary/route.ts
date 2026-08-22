import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAgentCenterSummary } from "@/lib/olivia/agentCenter/summary";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    return NextResponse.json(await getAgentCenterSummary(getSupabaseAdmin()), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Agent Center를 불러오지 못했어요." }, { status: 500 });
  }
}
