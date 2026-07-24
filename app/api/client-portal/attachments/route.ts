import { NextRequest } from "next/server";
import { getPortalProjectContext, pcrmError, pcrmOk } from "@/lib/pcrm/server";
import {
  PCRM_ATTACHMENT_BUCKET,
  validatePcrmAttachmentInput,
  verifyPcrmAttachmentEntity,
} from "@/lib/pcrm/attachments";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 고객 링크로 다시 접속해 주세요.", 401);
  const entityType = req.nextUrl.searchParams.get("entityType") ?? "";
  const entityId = req.nextUrl.searchParams.get("entityId") ?? "";
  const validEntity = await verifyPcrmAttachmentEntity(context.db, {
    clientId: context.session.clientId, workflowRunId: context.session.workflowRunId!, entityType, entityId,
  });
  if (!validEntity) return pcrmError("첨부 항목을 찾을 수 없습니다.", 404);
  const { data, error } = await context.db.from("pcrm_attachments").select("*")
    .eq("client_id", context.session.clientId).eq("workflow_run_id", context.session.workflowRunId)
    .eq("entity_type", entityType).eq("entity_id", entityId).order("created_at");
  if (error) return pcrmError(error.message, 500);
  const attachments = await Promise.all((data ?? []).map(async (item) => {
    const { data: signed } = await context.db.storage.from(item.storage_bucket)
      .createSignedUrl(item.storage_path, 60 * 15, { download: item.file_name });
    return { ...item, downloadUrl: signed?.signedUrl ?? null };
  }));
  return pcrmOk({ attachments });
}

export async function POST(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 고객 링크로 다시 접속해 주세요.", 401);
  const body = await req.json().catch(() => null);
  const validated = validatePcrmAttachmentInput({
    fileName: body?.fileName, mimeType: body?.mimeType, fileSize: body?.sizeBytes,
  });
  if (!validated.ok) return pcrmError(validated.error);
  const entityType = String(body?.entityType ?? "");
  const entityId = String(body?.entityId ?? "");
  const validEntity = await verifyPcrmAttachmentEntity(context.db, {
    clientId: context.session.clientId, workflowRunId: context.session.workflowRunId!, entityType, entityId,
  });
  if (!validEntity) return pcrmError("이 프로젝트의 항목에만 파일을 첨부할 수 있습니다.", 403);
  const storagePath = String(body?.storagePath ?? "");
  const expectedPrefix = `${context.session.workflowRunId}/${entityType}/${entityId}/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..")) return pcrmError("첨부 경로가 올바르지 않습니다.");
  const pathParts = storagePath.split("/");
  const objectName = pathParts.pop() ?? "";
  const folder = pathParts.join("/");
  const { data: objects, error: objectError } = await context.db.storage.from(PCRM_ATTACHMENT_BUCKET)
    .list(folder, { search: objectName, limit: 10 });
  if (objectError || !(objects ?? []).some((item) => item.name === objectName)) {
    return pcrmError("업로드된 파일을 확인할 수 없습니다. 다시 업로드해 주세요.", 409);
  }
  const { data, error } = await context.db.from("pcrm_attachments").insert({
    client_id: context.session.clientId,
    workflow_run_id: context.session.workflowRunId,
    entity_type: entityType,
    entity_id: entityId,
    uploaded_by: "client",
    storage_bucket: PCRM_ATTACHMENT_BUCKET,
    storage_path: storagePath,
    file_name: validated.value.fileName,
    mime_type: validated.value.mimeType,
    size_bytes: validated.value.fileSize,
  }).select().single();
  if (error) return pcrmError(error.message, 500);
  await recordPcrmActivitySafely(context.db, {
    clientId: context.session.clientId,
    workflowRunId: context.session.workflowRunId,
    actorType: "client",
    actorName: context.session.clientName,
    actionType: "attachment_added",
    title: `${validated.value.fileName} 첨부`,
    relatedType: entityType,
    relatedId: entityId,
  });
  return pcrmOk({ attachment: data }, 201);
}
