import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalSession } from "@/lib/clientPortal";
import { canTransitionPublication } from "./collaboration";
import { recordPcrmActivitySafely } from "./activity";
import type { PcrmPublicationStatus } from "./types";
import { maybeAdvanceWorkflow } from "@/lib/workflowAutomation";

// 워크플로우 단계 자동전환 대상 문서 타입 — 견적/계약 승인은 곧 그 단계의 완료를 뜻하므로
// 고객이 포털에서 승인하는 순간 다음 단계(계약/콘티)로 자동 전환한다.
const WORKFLOW_STEP_BY_RELATED_TYPE: Record<string, string> = {
  quote: "quote",
  contract: "contract",
};

type PublicationAction = "view" | "approve" | "request_revision";

const ACTION_COPY: Record<PublicationAction, { actionType: string; suffix: string }> = {
  view: { actionType: "publication_viewed", suffix: "열람" },
  approve: { actionType: "publication_approved", suffix: "승인" },
  request_revision: { actionType: "publication_revision_requested", suffix: "수정 요청" },
};

export async function applyPortalPublicationAction(
  db: SupabaseClient,
  session: PortalSession,
  id: string,
  action: PublicationAction,
  feedback = "",
) {
  const { data: publication } = await db.from("pcrm_publications")
    .select("*")
    .eq("id", id)
    .eq("client_id", session.clientId)
    .eq("workflow_run_id", session.workflowRunId)
    .maybeSingle();
  if (!publication) return { ok: false as const, status: 404, error: "공개 자료를 찾을 수 없습니다." };

  const current = publication.status as PcrmPublicationStatus;
  if (action === "view" && current !== "published") {
    return { ok: true as const, publication };
  }
  if (!canTransitionPublication(current, action)) {
    return { ok: false as const, status: 409, error: "현재 상태에서는 이 작업을 진행할 수 없습니다." };
  }

  const now = new Date().toISOString();
  const patch = action === "view"
    ? { status: "viewed", viewed_at: now }
    : action === "approve"
      ? { status: "approved", approved_at: now, feedback: feedback || publication.feedback || "" }
      : { status: "revision_requested", revision_requested_at: now, feedback };
  const { data, error } = await db.from("pcrm_publications")
    .update(patch)
    .eq("id", id)
    .eq("status", current)
    .select()
    .maybeSingle();
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!data) return { ok: false as const, status: 409, error: "다른 화면에서 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요." };

  const copy = ACTION_COPY[action];
  await recordPcrmActivitySafely(db, {
    clientId: session.clientId,
    workflowRunId: session.workflowRunId,
    actorType: "client",
    actorName: session.clientName,
    actionType: copy.actionType,
    title: `${publication.title} ${copy.suffix}`,
    description: feedback,
    relatedType: publication.related_type,
    relatedId: publication.related_id,
  });

  const stepKey = WORKFLOW_STEP_BY_RELATED_TYPE[publication.related_type];
  if (stepKey && session.workflowRunId) {
    if (action === "approve") {
      // 고객이 견적/계약을 승인하면 그 단계의 내부 검토 업무가 이미 끝났다는 전제 하에
      // 곧바로 다음 단계로 전환을 시도한다 (내부 업무가 남아있으면 maybeAdvanceWorkflow가 대기시킨다).
      await maybeAdvanceWorkflow(db, session.workflowRunId, stepKey);
    } else if (action === "request_revision") {
      // 단계는 유지하고, 관리자가 놓치지 않도록 업무를 하나 만들어 둔다.
      await db.from("agent_tasks").insert({
        client_id: session.clientId,
        workflow_run_id: session.workflowRunId,
        workflow_step_key: stepKey,
        workflow_step_name: session.currentStepName,
        task_type: "revision_review",
        title: `${publication.title} 수정 요청 검토`,
        description: feedback,
        input_data: { publicationId: publication.id, relatedType: publication.related_type, relatedId: publication.related_id },
        priority: "high",
        status: "pending",
      });
    }
  }

  return { ok: true as const, publication: data };
}
