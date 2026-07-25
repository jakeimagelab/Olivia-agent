import { NextRequest } from "next/server";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { pcrmError, pcrmOk, validateAdminProject } from "@/lib/pcrm/server";
import { isPcrmUuid } from "@/lib/pcrm/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  const workflowRunId = req.nextUrl.searchParams.get("workflowRunId");
  const context = await validateAdminProject(clientId, workflowRunId);
  if (!context) return pcrmError("고객 프로젝트를 찾을 수 없습니다.", 404);
  const { db } = context;
  const [selectResult, photoResult, publicationResult, selectionResult, annotationResult, confirmationResult] = await Promise.all([
    db.from("select_galleries").select("id,title,status,total_jpg_count,selected_count,file_expires_at,created_at")
      .eq("client_id", clientId!).eq("workflow_run_id", workflowRunId!).order("created_at", { ascending: false }),
    db.from("photo_galleries").select("*,items:photo_gallery_items(*)")
      .eq("client_id", clientId!).eq("workflow_run_id", workflowRunId!).order("created_at", { ascending: false }),
    db.from("pcrm_publications").select("*")
      .eq("client_id", clientId!).eq("workflow_run_id", workflowRunId!)
      .in("related_type", ["select_gallery", "gallery", "final_delivery"]).order("created_at", { ascending: false }),
    db.from("client_photo_selections").select("*")
      .eq("client_id", clientId!).eq("workflow_run_id", workflowRunId!).order("submitted_at", { ascending: false }),
    db.from("pcrm_photo_annotations").select("*")
      .eq("client_id", clientId!).eq("workflow_run_id", workflowRunId!).order("updated_at", { ascending: false }),
    db.from("pcrm_delivery_confirmations").select("*")
      .eq("client_id", clientId!).eq("workflow_run_id", workflowRunId!).order("updated_at", { ascending: false }),
  ]);
  const firstError = [selectResult.error, photoResult.error, publicationResult.error, selectionResult.error, annotationResult.error, confirmationResult.error].find(Boolean);
  if (firstError) return pcrmError(firstError.message, 500);
  return pcrmOk({
    selectGalleries: selectResult.data ?? [],
    photoGalleries: photoResult.data ?? [],
    publications: publicationResult.data ?? [],
    selections: selectionResult.data ?? [],
    annotations: annotationResult.data ?? [],
    confirmations: confirmationResult.data ?? [],
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const clientId = body?.clientId;
  const workflowRunId = body?.workflowRunId;
  const annotationId = String(body?.annotationId ?? "");
  const context = await validateAdminProject(clientId, workflowRunId);
  if (!context) return pcrmError("고객 프로젝트를 찾을 수 없습니다.", 404);
  if (!isPcrmUuid(annotationId)) return pcrmError("수정 표시 ID가 올바르지 않습니다.", 400);
  const status = String(body?.status ?? "");
  if (!["submitted", "in_progress", "resolved"].includes(status)) return pcrmError("지원하지 않는 처리 상태입니다.", 400);
  const reply = String(body?.adminReply ?? "").trim().slice(0, 2_000);
  const now = new Date().toISOString();
  const { data, error } = await context.db.from("pcrm_photo_annotations").update({
    status,
    admin_reply: reply,
    resolved_at: status === "resolved" ? now : null,
  }).eq("id", annotationId).eq("client_id", clientId).eq("workflow_run_id", workflowRunId).select().maybeSingle();
  if (error) return pcrmError(error.message, 500);
  if (!data) return pcrmError("수정 표시를 찾을 수 없습니다.", 404);
  await recordPcrmActivitySafely(context.db, {
    clientId,
    workflowRunId,
    actorType: "admin",
    actionType: status === "resolved" ? "photo_revision_resolved" : "photo_revision_updated",
    title: status === "resolved" ? "사진 수정 요청 해결" : "사진 수정 요청 처리",
    description: reply,
    relatedType: "photo_annotation",
    relatedId: annotationId,
  });
  return pcrmOk({ annotation: data });
}
