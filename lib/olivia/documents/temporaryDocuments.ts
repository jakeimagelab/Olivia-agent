import type { SupabaseClient } from "@supabase/supabase-js";
import { createClientWithWorkflow } from "@/lib/clients/createClientWithWorkflow";
import { normalizeSearchText } from "@/lib/olivia/nameSearch";
import { resolveWorkflowRunId } from "@/lib/workflowRunLookup";

export const TEMPORARY_DOCUMENT_TYPES = ["quote", "contract", "conti", "report", "checklist", "revision", "project_document"] as const;
export type TemporaryDocumentType = typeof TEMPORARY_DOCUMENT_TYPES[number];
export type TemporaryDocumentSourceTable = "quotes" | "contracts" | "conti_runs" | "workflow_artifacts";
export type TemporaryDocumentStatus = "pending_review" | "content_approved" | "pending_client" | "linked" | "archived" | "failed";

export type TemporaryDocumentRow = {
  id: string;
  document_type: TemporaryDocumentType;
  source_table: TemporaryDocumentSourceTable;
  source_id: string;
  title: string;
  hospital_name: string;
  client_id: string | null;
  workflow_run_id: string | null;
  status: TemporaryDocumentStatus;
  preview_url: string | null;
  metadata: Record<string, unknown>;
  linked_at: string | null;
  created_at: string;
  updated_at: string;
};

const OPEN_STATUSES: TemporaryDocumentStatus[] = ["pending_review", "content_approved", "pending_client", "failed"];

function exactName(left: unknown, right: unknown) {
  const a = normalizeSearchText(left);
  return Boolean(a) && a === normalizeSearchText(right);
}

export async function findExactDocumentClient(db: SupabaseClient, hospitalName: string) {
  const { data, error } = await db.from("clients").select("id,hospital_name").limit(500);
  if (error) throw new Error(`기존 고객 확인 실패: ${error.message}`);
  const matches = (data ?? []).filter((row) => exactName(row.hospital_name, hospitalName));
  return matches.length === 1 ? matches[0] as { id: string; hospital_name: string } : null;
}

async function linkSource(db: SupabaseClient, sourceTable: TemporaryDocumentSourceTable, sourceId: string, clientId: string, workflowRunId: string | null) {
  const patch = sourceTable === "conti_runs"
    ? { hospital_id: clientId, workflow_run_id: workflowRunId }
    : { client_id: clientId, workflow_run_id: workflowRunId };
  const clientColumn = sourceTable === "conti_runs" ? "hospital_id" : "client_id";
  const { data, error } = await db.from(sourceTable).update(patch).eq("id", sourceId).select(`id,${clientColumn},workflow_run_id`).single();
  const verified = data as Record<string, unknown> | null;
  if (error || !verified || verified[clientColumn] !== clientId) throw new Error(`${sourceTable} 고객 연결 검증에 실패했습니다.`);
  return data;
}

export async function registerTemporaryDocument(db: SupabaseClient, input: {
  documentType: TemporaryDocumentType;
  sourceTable: TemporaryDocumentSourceTable;
  sourceId: string;
  title: string;
  hospitalName: string;
  clientId?: string | null;
  workflowRunId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  let clientId = input.clientId || null;
  let workflowRunId = input.workflowRunId || null;
  let clientResolution: "existing" | "pending" = clientId ? "existing" : "pending";
  if (!clientId && input.hospitalName) {
    const exact = await findExactDocumentClient(db, input.hospitalName);
    if (exact) {
      clientId = exact.id;
      workflowRunId = await resolveWorkflowRunId(db, workflowRunId, clientId);
      await linkSource(db, input.sourceTable, input.sourceId, clientId, workflowRunId);
      clientResolution = "existing";
    }
  }

  const now = new Date().toISOString();
  const status: TemporaryDocumentStatus = clientId ? "linked" : "pending_review";
  const { data, error } = await db.from("temporary_documents").upsert({
    document_type: input.documentType,
    source_table: input.sourceTable,
    source_id: input.sourceId,
    title: input.title,
    hospital_name: input.hospitalName,
    client_id: clientId,
    workflow_run_id: workflowRunId,
    status,
    metadata: input.metadata ?? {},
    linked_at: status === "linked" ? now : null,
    updated_at: now,
  }, { onConflict: "source_table,source_id" }).select("*").single();
  if (error || !data) throw new Error(`임시문서 등록에 실패했습니다: ${error?.message || "저장 결과 없음"}`);
  return { temporaryDocument: data as TemporaryDocumentRow, clientResolution };
}

export async function listTemporaryDocuments(db: SupabaseClient, input: { query?: string; limit?: number } = {}) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  let query = db.from("temporary_documents").select("*").in("status", OPEN_STATUSES).order("updated_at", { ascending: false }).limit(limit);
  if (input.query?.trim()) query = query.ilike("hospital_name", `%${input.query.trim()}%`);
  const { data, error } = await query;
  if (error) throw new Error(`임시문서를 불러오지 못했습니다: ${error.message}`);
  return (data ?? []) as TemporaryDocumentRow[];
}

export async function getTemporaryDocument(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("temporary_documents").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("임시문서를 찾지 못했습니다.");
  return data as TemporaryDocumentRow;
}

export async function updateTemporaryDocumentStatus(db: SupabaseClient, id: string, status: TemporaryDocumentStatus, metadata?: Record<string, unknown>) {
  const current = await getTemporaryDocument(db, id);
  const nextMetadata = { ...(current.metadata ?? {}), ...(metadata ?? {}) };
  const { data, error } = await db.from("temporary_documents").update({ status, metadata: nextMetadata, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error || !data) throw new Error("임시문서 상태를 저장하지 못했습니다.");
  return data as TemporaryDocumentRow;
}

export async function linkTemporaryDocumentsForHospital(db: SupabaseClient, temporaryDocumentId: string) {
  const selected = await getTemporaryDocument(db, temporaryDocumentId);
  const open = await listTemporaryDocuments(db, { limit: 100 });
  const targets = open.filter((row) => exactName(row.hospital_name, selected.hospital_name));
  const created = await createClientWithWorkflow(db, { hospitalName: selected.hospital_name, eventSource: "temporary_document" });
  const clientId = created.client.id;
  const workflowRunId = created.run?.id ?? await resolveWorkflowRunId(db, null, clientId);
  const linked: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const document of targets) {
    try {
      await linkSource(db, document.source_table, document.source_id, clientId, workflowRunId);
      const now = new Date().toISOString();
      const { error } = await db.from("temporary_documents").update({ client_id: clientId, workflow_run_id: workflowRunId, status: "linked", linked_at: now, updated_at: now }).eq("id", document.id);
      if (error) throw error;
      linked.push(document.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "연결 실패";
      failed.push({ id: document.id, error: message });
      await db.from("temporary_documents").update({ status: "failed", metadata: { ...(document.metadata ?? {}), linkError: message }, updated_at: new Date().toISOString() }).eq("id", document.id);
    }
  }
  return { client: created.client, workflowRunId, linked, failed, created: created.created };
}

export function temporaryDocumentRoute(row: Pick<TemporaryDocumentRow, "source_table" | "source_id">) {
  if (row.source_table === "quotes") return `/quote?id=${encodeURIComponent(row.source_id)}`;
  if (row.source_table === "contracts") return `/contract?resourceId=${encodeURIComponent(row.source_id)}`;
  if (row.source_table === "conti_runs") return `/conti?resourceId=${encodeURIComponent(row.source_id)}`;
  return `/admin/documents?artifactId=${encodeURIComponent(row.source_id)}`;
}
