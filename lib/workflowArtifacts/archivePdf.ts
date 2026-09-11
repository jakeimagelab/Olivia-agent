import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { toAsciiStorageSegment } from "@/lib/storageKey";
import { OliviaToolError } from "@/lib/olivia/v2/toolError";

const BUCKET = "workflow-artifacts";
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function safeFileName(value: string) {
  return value.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 180) || "document.pdf";
}

export async function archiveWorkflowPdf(input: {
  buffer: Buffer;
  fileName: string;
  title: string;
  documentType: "quote" | "contract";
  sourceTable: "quotes" | "contracts";
  sourceId: string;
  clientId: string;
  workflowRunId: string;
}, db: SupabaseClient = getSupabaseAdmin()) {
  if (!input.buffer.length || input.buffer.length > MAX_FILE_SIZE) throw new OliviaToolError("PDF는 25MB 이하만 저장할 수 있습니다.", "VALIDATION_ERROR");

  const { data: run, error: runError } = await db.from("workflow_runs").select("id,client_id").eq("id", input.workflowRunId).maybeSingle();
  if (runError) throw new OliviaToolError("워크플로우 연결을 확인하지 못했습니다.", "DB_ERROR", { databaseMessage: runError.message });
  if (!run || run.client_id !== input.clientId) throw new OliviaToolError("고객과 워크플로우 연결이 일치하지 않습니다.", "VERIFICATION_FAILED");

  const { data: source, error: sourceError } = await db.from(input.sourceTable).select("id,client_id,workflow_run_id").eq("id", input.sourceId).maybeSingle();
  if (sourceError) throw new OliviaToolError("원본 문서를 확인하지 못했습니다.", "DB_ERROR", { databaseMessage: sourceError.message });
  if (!source) throw new OliviaToolError("원본 문서 데이터를 찾지 못했습니다.", "NOT_FOUND");
  if (source.client_id && source.client_id !== input.clientId) throw new OliviaToolError("원본 문서의 고객 연결이 일치하지 않습니다.", "VERIFICATION_FAILED");

  const { data: existing, error: existingError } = await db.from("workflow_artifacts")
    .select("id,storage_path").eq("source_table", input.sourceTable).eq("source_id", input.sourceId)
    .eq("document_type", input.documentType).maybeSingle();
  if (existingError) throw new OliviaToolError("기존 PDF 원본을 확인하지 못했습니다.", "DB_ERROR", { databaseMessage: existingError.message });

  const artifactId = existing?.id || randomUUID();
  const fileName = safeFileName(input.fileName);
  const storageName = toAsciiStorageSegment(fileName, `${input.documentType}.pdf`);
  const storagePath = `${input.clientId}/${input.workflowRunId}/${input.documentType}/${artifactId}/${storageName}`;
  const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, input.buffer, { contentType: "application/pdf", cacheControl: "3600", upsert: true });
  if (uploadError) throw new OliviaToolError("PDF 원본을 업로드하지 못했습니다.", "STORAGE_ERROR", { storageMessage: uploadError.message });

  const { data: artifact, error: metadataError } = await db.from("workflow_artifacts").upsert({
    id: artifactId, client_id: input.clientId, workflow_run_id: input.workflowRunId,
    workflow_step_key: input.documentType, document_type: input.documentType,
    source_table: input.sourceTable, source_id: input.sourceId, title: input.title,
    file_name: fileName, storage_path: storagePath, mime_type: "application/pdf",
    file_size: input.buffer.length, status: "ready", updated_at: new Date().toISOString(),
  }, { onConflict: "source_table,source_id,document_type" }).select("*").single();
  if (metadataError || !artifact) {
    await db.storage.from(BUCKET).remove([storagePath]);
    throw new OliviaToolError("PDF 원본 메타데이터를 저장하지 못했습니다.", "DB_ERROR", { databaseMessage: metadataError?.message });
  }

  const { data: linkedSource, error: linkError } = await db.from(input.sourceTable)
    .update({ client_id: input.clientId, workflow_run_id: input.workflowRunId }).eq("id", input.sourceId)
    .select("id,client_id,workflow_run_id").single();
  if (linkError || !linkedSource) throw new OliviaToolError("원본 문서 연결을 저장하지 못했습니다.", "DB_ERROR", { databaseMessage: linkError?.message });
  if (linkedSource.client_id !== input.clientId || linkedSource.workflow_run_id !== input.workflowRunId || artifact.status !== "ready") {
    throw new OliviaToolError("PDF 원본 저장 검증이 일치하지 않습니다.", "VERIFICATION_FAILED");
  }
  if (existing?.storage_path && existing.storage_path !== storagePath) await db.storage.from(BUCKET).remove([existing.storage_path]);
  return artifact as Record<string, unknown>;
}
