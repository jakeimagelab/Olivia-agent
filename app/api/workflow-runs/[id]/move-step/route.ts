import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ACTIVE_WORKFLOW_STEP_KEYS } from "@/lib/workflow";
import { advanceWorkflow, getWorkflowRun, guardWorkflowStepJump } from "@/lib/workflowAutomation";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 고객 상세 화면(app/(client-hub)/clients/page.tsx)의 "⋮ 더보기 → 단계 이동" 메뉴가 호출하는
// 수동 단계 이동 엔드포인트(코드 요청서 3차 4번 항목, 2026-08-16). 챗의 advance_workflow_step
// 도구(lib/olivia/tools/workflow.ts)와 완전히 동일한 로직(guardWorkflowStepJump로 실제 문서
// 없이 견적/계약/콘티 단계를 건너뛰지 못하게 막는 가드 포함)을 공유해서, 화면과 챗 두 경로가
// 서로 다른 기준으로 동작하지 않게 한다. 목표 단계는 활성 12단계 중 아무 곳으로나(앞/뒤 무관)
// 한 번에 이동할 수 있다 — advanceWorkflow 자체가 이미 방향 제한 없이 임의 단계 지정을 지원한다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: workflowRunId } = await params;
  const body = await req.json().catch(() => ({} as any));
  const toStepKey = typeof body?.toStepKey === "string" ? body.toStepKey : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!(ACTIVE_WORKFLOW_STEP_KEYS as readonly string[]).includes(toStepKey)) {
    return NextResponse.json({ ok: false, error: "이동할 수 없는 단계입니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  try {
    const run = await getWorkflowRun(db, workflowRunId);

    if (run.current_step_key === toStepKey) {
      return NextResponse.json({ ok: false, error: "이미 해당 단계에 있습니다." }, { status: 400 });
    }

    const guard = await guardWorkflowStepJump(db, run, toStepKey);
    if (guard.blocked) {
      return NextResponse.json({ ok: false, blocked: true, error: guard.hint });
    }

    const fromStepKey = run.current_step_key;
    await advanceWorkflow(db, {
      workflow_run_id: workflowRunId,
      to_step_key: toStepKey,
      reason: reason || "관리자 수동 이동",
    });

    await recordPcrmActivitySafely(db, {
      clientId: run.client_id ?? undefined,
      workflowRunId,
      actorType: "admin",
      actorName: "관리자",
      actionType: "workflow_step_moved",
      title: `워크플로우 단계를 수동으로 이동함 (${fromStepKey} → ${toStepKey})`,
      relatedType: "workflow_run",
      relatedId: workflowRunId,
    });

    return NextResponse.json({ ok: true, workflowRunId, fromStepKey, toStepKey });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "단계 이동 실패" }, { status: 500 });
  }
}
