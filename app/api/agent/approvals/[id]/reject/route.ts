import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("agent_approvals")
    .update({ status: "rejected", admin_memo: body.memo ?? "", rejected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (data.agent_task_id) await db.from("agent_tasks").update({ status: "failed", error_message: body.memo ?? "승인 반려" }).eq("id", data.agent_task_id);
  if (data.related_type === "olivia_action" && data.related_id) {
    await db.from("olivia_actions").update({ status: "dismissed", error_message: body.memo ?? "승인 반려" }).eq("id", data.related_id);
    await db.from("olivia_feedback").insert({
      action_id: data.related_id,
      feedback_type: "rejected",
      original_content: data.preview_data ?? {},
      reason: body.memo ?? "",
    });
  }
  await db.from("agent_logs").insert({
    workflow_run_id: data.workflow_run_id,
    agent_task_id: data.agent_task_id,
    log_type: "approval_rejected",
    message: `${data.title} 항목이 반려되었습니다.`,
    success: true,
  });
  await emitOliviaEventSafely(db, {
    eventType: "approval.rejected",
    eventSource: "agent_approvals_api",
    clientId: data.client_id ?? null,
    projectId: data.project_id ?? null,
    workflowRunId: data.workflow_run_id ?? null,
    actorType: "admin",
    payload: { approvalId: data.id, approvalType: data.approval_type, taskId: data.agent_task_id },
    deduplicationKey: createEventDeduplicationKey("approval.rejected", data.id),
  });
  return NextResponse.json({ ok: true, approval: data });
}
