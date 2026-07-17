import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { advanceWorkflow, createStepTasks, logAgent } from "@/lib/workflowAutomation";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventToStep: Record<string, string> = {
  quote_confirmed: "contract",
  contract_confirmed: "conti",
  conti_confirmed: "shooting",
  revision_requested: "revision",
  review_submitted: "review_content",
  product_requested: "reward",
  donation_requested: "reward",
};

const portalEventName: Record<string, string> = {
  quote_confirmed: "client.quote_confirmed",
  contract_confirmed: "client.contract_confirmed",
  conti_confirmed: "client.conti_confirmed",
  selection_started: "client.selection_started",
  selection_completed: "client.selection_completed",
  revision_requested: "client.revision_requested",
  review_submitted: "client.review_submitted",
  product_requested: "client.product_requested",
  donation_requested: "client.donation_requested",
  quote_viewed: "client.quote_viewed",
  contract_viewed: "client.contract_viewed",
  conti_viewed: "client.conti_viewed",
  gallery_viewed: "client.gallery_viewed",
};

const eventToTask: Record<string, { step: string; task_type: string; title: string; description: string }> = {
  revision_requested: { step: "revision", task_type: "revision_review", title: "고객 수정 요청 검토", description: "고객 포털에서 접수된 수정 요청을 검토합니다." },
  review_submitted: { step: "review_content", task_type: "review_summarize", title: "고객 리뷰 요약", description: "고객 포털에 제출된 리뷰를 콘텐츠 후보로 요약합니다." },
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { workflow_run_id, event_type, payload = {} } = body;
  if (!workflow_run_id || !event_type) {
    return NextResponse.json({ ok: false, error: "workflow_run_id, event_type 필수" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  try {
    await logAgent(db, {
      workflow_run_id,
      log_type: `portal_${event_type}`,
      message: `고객 포털 이벤트 수신: ${event_type}`,
      input_summary: JSON.stringify(payload).slice(0, 500),
    });

    const canonicalEvent = portalEventName[event_type] || `client.${event_type}`;
    await emitOliviaEventSafely(db, {
      eventType: canonicalEvent,
      eventSource: "workflow_portal_event_api",
      workflowRunId: workflow_run_id,
      actorType: "client",
      payload: { eventType: event_type, ...payload },
      deduplicationKey: payload.event_id
        ? createEventDeduplicationKey(canonicalEvent, workflow_run_id, String(payload.event_id))
        : null,
    });

    const toStep = eventToStep[event_type];
    if (toStep) await advanceWorkflow(db, { workflow_run_id, to_step_key: toStep, reason: `portal event: ${event_type}` });

    const taskDef = eventToTask[event_type];
    if (taskDef) {
      await createStepTasks(db, workflow_run_id, taskDef.step);
    }

    return NextResponse.json({ ok: true, event_type, to_step_key: toStep ?? null });
  } catch (error) {
    await logAgent(db, {
      workflow_run_id,
      log_type: "portal_event_failed",
      message: `고객 포털 이벤트 처리 실패: ${event_type}`,
      success: false,
      error_message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
