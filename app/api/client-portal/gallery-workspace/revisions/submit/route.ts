import { NextRequest } from "next/server";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";
import { verifyPortalPhotoGallery } from "@/lib/pcrm/galleryServer";
import { getPortalProjectContext, pcrmError, pcrmOk } from "@/lib/pcrm/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 링크로 다시 접속해주세요.", 401);
  const body = await req.json().catch(() => null);
  const galleryId = String(body?.galleryId ?? "");
  const verified = await verifyPortalPhotoGallery(context.db, context.session, galleryId, "gallery");
  if (!verified) return pcrmError("공개된 보정 갤러리를 찾을 수 없습니다.", 404);
  const { data: drafts, error: draftError } = await context.db.from("pcrm_photo_annotations")
    .select("id,image_id,marker_number,content")
    .eq("client_id", context.session.clientId)
    .eq("workflow_run_id", context.session.workflowRunId!)
    .eq("gallery_id", galleryId)
    .eq("status", "draft");
  if (draftError) return pcrmError(draftError.message, 500);
  if (!drafts?.length) return pcrmError("사진 위에 한 개 이상의 수정 위치와 내용을 표시해주세요.", 400);

  const title = String(body?.title ?? "사진 보정 수정 요청").trim().slice(0, 200);
  const memo = String(body?.memo ?? "").trim().slice(0, 5_000);
  const content = [
    `${drafts.length}개의 사진 위치 수정 요청`,
    ...drafts.map((item) => `사진 ${item.image_id} · 표시 ${item.marker_number}: ${item.content}`),
    memo,
  ].filter(Boolean).join("\n");
  const { data: revision, error } = await context.db.from("client_revision_requests").insert({
    client_id: context.session.clientId,
    workflow_run_id: context.session.workflowRunId,
    step_key: "revision",
    request_type: "photo",
    title,
    content,
    related_file: galleryId,
    priority: "normal",
    status: "requested",
  }).select("id").single();
  if (error) return pcrmError(error.message, 500);

  const { error: annotationError } = await context.db.from("pcrm_photo_annotations").update({
    revision_request_id: revision.id,
    status: "submitted",
  }).in("id", drafts.map((item) => item.id)).eq("status", "draft");
  if (annotationError) return pcrmError(annotationError.message, 500);

  await Promise.all([
    context.db.from("agent_tasks").insert({
      client_id: context.session.clientId,
      workflow_run_id: context.session.workflowRunId,
      workflow_step_key: "revision",
      workflow_step_name: "보정 전달 후 수정 접수",
      task_type: `photo_revision_review:${revision.id}`,
      title: `사진 수정 요청 검토: ${title}`,
      description: content,
      input_data: { revisionId: revision.id, galleryId, annotationCount: drafts.length },
      priority: "normal",
      status: "pending",
    }),
    recordPcrmActivitySafely(context.db, {
      clientId: context.session.clientId,
      workflowRunId: context.session.workflowRunId,
      actorType: "client",
      actorName: context.session.clientName,
      actionType: "photo_revision_requested",
      title,
      description: `${drafts.length}개 위치 표시`,
      relatedType: "revision_request",
      relatedId: revision.id,
    }),
  ]);
  return pcrmOk({ revisionId: revision.id, annotationCount: drafts.length }, 201);
}
