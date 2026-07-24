import { NextRequest } from "next/server";
import { pcrmError, pcrmOk, validateAdminProject } from "@/lib/pcrm/server";
import { isPcrmUuid } from "@/lib/pcrm/validation";
import { validateShortText } from "@/lib/pcrm/collaboration";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const workflowRunId = req.nextUrl.searchParams.get("workflowRunId");
  const context = await validateAdminProject(clientId, workflowRunId);
  if (!context) return pcrmError("고객 프로젝트를 찾을 수 없습니다.", 404);
  let query = context.db.from("pcrm_conti_scene_feedback").select("*")
    .eq("client_id", clientId).eq("workflow_run_id", workflowRunId)
    .order("updated_at", { ascending: false });
  const contiId = req.nextUrl.searchParams.get("contiId");
  if (contiId) {
    if (!isPcrmUuid(contiId)) return pcrmError("콘티 ID가 올바르지 않습니다.");
    query = query.eq("conti_id", contiId);
  }
  const { data, error } = await query;
  if (error) return pcrmError(error.message, 500);
  return pcrmOk({ feedback: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const context = await validateAdminProject(body?.clientId, body?.workflowRunId);
  if (!context || !isPcrmUuid(body?.id)) return pcrmError("콘티 피드백을 찾을 수 없습니다.", 404);
  const reply = validateShortText(body?.reply, "관리자 답변", 2000, false);
  if (!reply.ok) return pcrmError(reply.error);
  const resolve = Boolean(body?.resolve);
  const patch = resolve
    ? { admin_reply: reply.value, status: "resolved", resolved_at: new Date().toISOString() }
    : { admin_reply: reply.value };
  const { data, error } = await context.db.from("pcrm_conti_scene_feedback")
    .update(patch)
    .eq("id", body.id).eq("client_id", body.clientId).eq("workflow_run_id", body.workflowRunId)
    .select().maybeSingle();
  if (error || !data) return pcrmError(error?.message || "콘티 피드백을 찾을 수 없습니다.", 404);
  await recordPcrmActivitySafely(context.db, {
    clientId: body.clientId,
    workflowRunId: body.workflowRunId,
    actorType: "admin",
    actionType: resolve ? "conti_feedback_resolved" : "conti_feedback_replied",
    title: `${data.scene_title} ${resolve ? "피드백 해결" : "답변 등록"}`,
    description: reply.value,
    relatedType: "conti_scene",
    relatedId: data.id,
  });
  return pcrmOk({ feedback: data });
}
