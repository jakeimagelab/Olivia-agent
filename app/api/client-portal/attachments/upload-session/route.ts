import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { toAsciiStorageSegment } from "@/lib/storageKey";
import { getPortalProjectContext, pcrmError, pcrmOk } from "@/lib/pcrm/server";
import {
  PCRM_ATTACHMENT_BUCKET,
  validatePcrmAttachmentInput,
  verifyPcrmAttachmentEntity,
} from "@/lib/pcrm/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const context = await getPortalProjectContext(req);
  if (!context) return pcrmError("프로젝트 전용 고객 링크로 다시 접속해 주세요.", 401);
  const body = await req.json().catch(() => null);
  const validated = validatePcrmAttachmentInput({
    fileName: body?.fileName,
    mimeType: body?.mimeType,
    fileSize: body?.fileSize,
  });
  if (!validated.ok) return pcrmError(validated.error);
  const entityType = String(body?.entityType ?? "");
  const entityId = String(body?.entityId ?? "");
  const validEntity = await verifyPcrmAttachmentEntity(context.db, {
    clientId: context.session.clientId,
    workflowRunId: context.session.workflowRunId!,
    entityType,
    entityId,
  });
  if (!validEntity) return pcrmError("이 프로젝트의 항목에만 파일을 첨부할 수 있습니다.", 403);
  const storageName = toAsciiStorageSegment(validated.value.fileName, "attachment.bin").slice(0, 180);
  const storagePath = `${context.session.workflowRunId}/${entityType}/${entityId}/${randomUUID()}/${storageName}`;
  const { data, error } = await context.db.storage.from(PCRM_ATTACHMENT_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data?.token) return pcrmError(error?.message || "업로드를 준비하지 못했습니다.", 500);
  return pcrmOk({
    bucket: PCRM_ATTACHMENT_BUCKET,
    storagePath,
    token: data.token,
    fileName: validated.value.fileName,
    mimeType: validated.value.mimeType,
    sizeBytes: validated.value.fileSize,
    entityType,
    entityId,
  });
}
