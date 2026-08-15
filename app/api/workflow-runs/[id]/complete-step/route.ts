import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { completeOpenStepTasksForManualSave, getWorkflowRun, maybeAdvanceWorkflow } from "@/lib/workflowAutomation";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 문서형 기능(계약서/콘티, 그리고 콘티에 딸린 초상권동의서)의 공용 "최종완료" 엔드포인트
// (코드 요청서 2차 2번 항목, 2026-08-16). 견적서는 아직 고객/프로젝트가 없는 상태에서도
// 완료 처리해야 할 수 있어 별도 엔드포인트(app/api/quotes/[id]/complete)를 쓴다 — 여기는
// 이미 workflowRunId가 있는 화면(계약서·콘티·초상권동의서)만 대상으로 한다.
// 초상권동의서는 워크플로우 카탈로그에 전용 단계가 없어 콘티 단계의 부속 문서로 취급하고
// stepKey="conti"로 완료 처리한다(구현 전 확인 완료 — 별도 승인 절차를 새로 만들지 않는다).
const COMPLETABLE_STEP_KEYS = new Set(["contract", "conti"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: workflowRunId } = await params;
  const body = await req.json().catch(() => ({} as any));
  const stepKey = typeof body?.stepKey === "string" ? body.stepKey : "";
  if (!COMPLETABLE_STEP_KEYS.has(stepKey)) {
    return NextResponse.json({ ok: false, error: "완료 처리할 수 없는 단계입니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  try {
    const run = await getWorkflowRun(db, workflowRunId);
    await completeOpenStepTasksForManualSave(db, workflowRunId, stepKey);
    const result = await maybeAdvanceWorkflow(db, workflowRunId, stepKey);

    await recordPcrmActivitySafely(db, {
      clientId: run.client_id ?? undefined,
      workflowRunId,
      actorType: "admin",
      actorName: "관리자",
      actionType: `${stepKey}_completed`,
      title: `${stepKey === "contract" ? "계약서" : "콘티"} 단계가 최종완료 처리됨`,
      relatedType: stepKey,
      relatedId: workflowRunId,
    });

    return NextResponse.json({ ok: true, workflowRunId, advanced: result.advanced });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "최종완료 처리 실패" }, { status: 500 });
  }
}
