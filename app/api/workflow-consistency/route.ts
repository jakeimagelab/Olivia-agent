import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { findWorkflowConsistencyIssues } from "@/lib/workflowAutomation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 코드 요청서 7차(2026-08-16) — 관리자 대시보드의 "정합성 점검" 위젯이 매번 열 때마다
// 호출한다. 활성 프로젝트 수가 아직 크지 않아 매번 전체 계산해도 무리 없다 — 나중에
// 프로젝트가 많아지면 이 라우트 안에서만 배치/캐시 전략으로 바꾸면 된다(화면은 그대로).
export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const issues = await findWorkflowConsistencyIssues(db);
    return NextResponse.json({ ok: true, issues });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "정합성 점검 실패" }, { status: 500 });
  }
}
