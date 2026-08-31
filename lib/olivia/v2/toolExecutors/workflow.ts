import { getSupabaseAdmin } from "@/lib/supabase";
import {
  advanceWorkflowStep,
  approveWorkflowTask,
  completeWorkflowRetroactively,
  getWorkflowStatus,
  listWorkflowStepTasks,
  processWorkflowStep,
} from "@/lib/olivia/tools/workflow";
import { linkDocumentToClient } from "@/lib/olivia/tools/documentLink";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { fromLegacyResult } from "./common";
import { createVerification } from "./verification";

export const WORKFLOW_TOOL_NAMES = [
  "get_workflow_status", "list_active_workflows", "advance_workflow_step",
  "complete_workflow_retroactively", "list_workflow_step_tasks", "process_workflow_step",
  "approve_workflow_task", "link_document_to_client",
] as const;

export async function executeWorkflowTool(
  name: string,
  input: Record<string, unknown>,
  _context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  if (name === "get_workflow_status") return fromLegacyResult(name, await getWorkflowStatus(input));
  if (name === "list_active_workflows") {
    const { data: runs, error } = await db
      .from("workflow_runs")
      .select("id, client_id, client_name, current_step_key, status, updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(30);
    if (error) throw new Error("진행 중인 프로젝트를 불러오지 못했어요.");
    return { tool: name, success: true, data: { runs: runs ?? [], count: runs?.length ?? 0 } };
  }
  if (name === "advance_workflow_step") return fromLegacyResult(name, await advanceWorkflowStep(input));
  if (name === "complete_workflow_retroactively") return fromLegacyResult(name, await completeWorkflowRetroactively(input));
  if (name === "list_workflow_step_tasks") return fromLegacyResult(name, await listWorkflowStepTasks(input));
  if (name === "process_workflow_step") return fromLegacyResult(name, await processWorkflowStep(input));
  if (name === "approve_workflow_task") return fromLegacyResult(name, await approveWorkflowTask(input));

  if (name === "link_document_to_client") {
    const legacy = await linkDocumentToClient(input) as { documentId?: string; clientName?: string; message: string; [key: string]: unknown };
    const result = fromLegacyResult(name, legacy);
    // linkDocumentToClient()는 실패해도 throw하지 않고 안내 메시지만 돌려준다(찾지 못함/모호함/
    // DB 오류 전부 같은 모양) — documentId가 실려 있을 때만 실제로 연결이 이뤄진 것이다.
    // 문서 자체는 이미 존재하니(스펙 §16 "문서 생성 자체가 성공했어도") linked만 정확히 구분한다.
    const linked = Boolean(legacy.documentId && legacy.clientName);
    return { ...result, verification: createVerification({ executed: true, persisted: linked, linked, resourceExists: linked }) };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
