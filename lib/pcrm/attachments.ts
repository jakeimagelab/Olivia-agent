import type { SupabaseClient } from "@supabase/supabase-js";
import { isPcrmUuid } from "./validation";

export const PCRM_ATTACHMENT_BUCKET = "pcrm-attachments";
export const PCRM_ATTACHMENT_TYPES = ["preparation", "conti_feedback", "inquiry_message"] as const;
export const PCRM_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export function validatePcrmAttachmentInput(input: {
  fileName: unknown;
  mimeType: unknown;
  fileSize: unknown;
}) {
  const fileName = String(input.fileName ?? "").trim().replace(/[\u0000-\u001f]/g, "");
  const mimeType = String(input.mimeType ?? "application/octet-stream").trim().toLowerCase();
  const fileSize = Number(input.fileSize);
  if (!fileName || fileName.length > 220) return { ok: false as const, error: "파일명이 올바르지 않습니다." };
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > PCRM_ATTACHMENT_MAX_BYTES) {
    return { ok: false as const, error: "파일은 50MB 이하만 첨부할 수 있습니다." };
  }
  const blocked = ["application/x-msdownload", "application/x-sh", "application/x-executable"];
  if (blocked.includes(mimeType)) return { ok: false as const, error: "실행 파일은 첨부할 수 없습니다." };
  return { ok: true as const, value: { fileName, mimeType, fileSize } };
}

export async function verifyPcrmAttachmentEntity(
  db: SupabaseClient,
  input: { clientId: string; workflowRunId: string; entityType: string; entityId: string },
) {
  if (!isPcrmUuid(input.entityId) || !PCRM_ATTACHMENT_TYPES.includes(input.entityType as any)) return false;
  if (input.entityType === "preparation") {
    const { data } = await db.from("pcrm_preparation_items").select("id").eq("id", input.entityId)
      .eq("client_id", input.clientId).eq("workflow_run_id", input.workflowRunId).maybeSingle();
    return Boolean(data);
  }
  if (input.entityType === "conti_feedback") {
    const { data } = await db.from("pcrm_conti_scene_feedback").select("id").eq("id", input.entityId)
      .eq("client_id", input.clientId).eq("workflow_run_id", input.workflowRunId).maybeSingle();
    return Boolean(data);
  }
  const { data: message } = await db.from("pcrm_inquiry_messages").select("id,inquiry_id").eq("id", input.entityId).maybeSingle();
  if (!message) return false;
  const { data: inquiry } = await db.from("pcrm_inquiries").select("id").eq("id", message.inquiry_id)
    .eq("client_id", input.clientId).eq("workflow_run_id", input.workflowRunId).maybeSingle();
  return Boolean(inquiry);
}
