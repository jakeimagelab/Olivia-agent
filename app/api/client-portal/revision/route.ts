import { NextRequest, NextResponse } from "next/server";
import { validatePortalToken, logPortalEvent } from "@/lib/clientPortal";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ACTIVE_WORKFLOW_STEPS } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-portal-token") ?? "";
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

  const db = getSupabaseAdmin();
  const visibleStepNames = new Map(
    ACTIVE_WORKFLOW_STEPS.filter((step) => step.visible_to_client).map((step) => [step.key, step.name]),
  );
  const [revisionResult, approvalResult] = await Promise.all([
    db
      .from("client_revision_requests")
      .select("*")
      .eq("client_id", session.clientId)
      .order("created_at", { ascending: false }),
    session.workflowRunId
      ? db
          .from("agent_approvals")
          .select("id,project_id,workflow_run_id,workflow_step_key,title,description,preview_data,status,approved_at,updated_at")
          .eq("client_id", session.clientId)
          .eq("workflow_run_id", session.workflowRunId)
          .eq("status", "approved")
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const eligibleApprovals = (approvalResult.data ?? [])
    .filter((approval: any) => visibleStepNames.has(approval.workflow_step_key))
    .map((approval: any) => ({
      ...approval,
      stepKey: approval.workflow_step_key,
      stepName: visibleStepNames.get(approval.workflow_step_key),
    }));

  return NextResponse.json({ ok: true, revisions: revisionResult.data ?? [], eligibleApprovals });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-portal-token") ?? "";
  const session = await validatePortalToken(token);
  if (!session) return NextResponse.json({ ok: false, error: "인증 필요" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const {
    projectId,
    stepKey,
    approvalId,
    message,
    requestType,
    title,
    content,
    relatedFile,
    priority,
  } = body as Record<string, unknown>;
  const revisionContent = String(message ?? content ?? "").trim();
  const revisionTitle = String(title ?? "").trim();
  const normalizedPriority = ["low", "normal", "high", "urgent"].includes(String(priority))
    ? String(priority)
    : "normal";

  if (!revisionContent) {
    return NextResponse.json({ ok: false, error: "수정 요청 내용을 입력해주세요." }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // 승인 결과에 연결된 수정 요청은 DB 함수 하나로 검증·상태 변경·작업 생성을 처리한다.
  if (approvalId || stepKey || projectId) {
    if (!approvalId || !stepKey || !session.workflowRunId) {
      return NextResponse.json(
        { ok: false, error: "승인 항목과 워크플로우 단계 정보가 필요합니다." },
        { status: 400 },
      );
    }

    const { data, error } = await db.rpc("request_client_revision", {
      p_client_id: session.clientId,
      p_workflow_run_id: session.workflowRunId,
      p_project_id: projectId ? String(projectId) : null,
      p_step_key: String(stepKey),
      p_approval_id: String(approvalId),
      p_title: revisionTitle,
      p_content: revisionContent,
      p_request_type: String(requestType ?? "general"),
      p_related_file: String(relatedFile ?? ""),
      p_priority: normalizedPriority,
    });

    if (error) {
      const mapped = mapRevisionError(error.message);
      return NextResponse.json({ ok: false, error: mapped.message }, { status: mapped.status });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      ok: true,
      id: result?.request_id,
      created: result?.created ?? true,
    });
  }

  // 기존 포털의 일반 수정 접수 형식도 계속 지원한다.
  if (!revisionTitle) {
    return NextResponse.json({ ok: false, error: "제목을 입력해주세요." }, { status: 400 });
  }

  const { data, error } = await db
    .from("client_revision_requests")
    .insert({
      client_id: session.clientId,
      workflow_run_id: session.workflowRunId,
      step_key: session.currentStepKey,
      request_type: String(requestType ?? "general"),
      title: revisionTitle,
      content: revisionContent,
      related_file: String(relatedFile ?? ""),
      priority: normalizedPriority,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const taskPriority = normalizedPriority === "urgent" ? "urgent" : normalizedPriority === "high" ? "high" : "normal";

  await Promise.all([
    db.from("agent_tasks").insert({
      client_id: session.clientId,
      workflow_run_id: session.workflowRunId,
      workflow_step_key: session.currentStepKey,
      workflow_step_name: session.currentStepName,
      task_type: "revision_review",
      title: `수정 요청 검토: ${revisionTitle}`,
      description: revisionContent,
      input_data: { revisionId: data.id, requestType: requestType ?? "general", priority: normalizedPriority },
      priority: taskPriority,
      status: "pending",
    }),
    logPortalEvent({
      clientId: session.clientId,
      eventType: "revision_requested",
      targetType: "revision_request",
      targetId: data.id,
      memo: revisionTitle,
      workflowRunId: session.workflowRunId,
    }),
  ]);

  return NextResponse.json({ ok: true, id: data.id });
}

function mapRevisionError(message: string) {
  if (message.includes("NOT_FOUND")) return { status: 404, message: "연결된 승인 또는 프로젝트를 찾을 수 없습니다." };
  if (message.includes("MISMATCH") || message.includes("NOT_CLIENT_VISIBLE")) {
    return { status: 403, message: "이 승인 항목에는 수정 요청을 보낼 수 없습니다." };
  }
  if (message.includes("NOT_APPROVED") || message.includes("NOT_IN_REVISION")) {
    return { status: 409, message: "현재 승인 상태에서는 수정 요청을 보낼 수 없습니다." };
  }
  if (message.includes("CONTENT_REQUIRED")) return { status: 400, message: "수정 요청 내용을 입력해주세요." };
  return { status: 500, message: "수정 요청을 저장하지 못했습니다. 잠시 후 다시 시도해주세요." };
}
