import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAgentRun } from "@/lib/olivia/agentRuns/service";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try { const data = await getAgentRun(getSupabaseAdmin(), (await params).id); return data ? NextResponse.json({ ok: true, ...data }) : NextResponse.json({ ok: false, error: "Run을 찾지 못했어요." }, { status: 404 }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Run 조회 실패" }, { status: 500 }); }
}
