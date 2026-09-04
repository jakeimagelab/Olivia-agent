import { getSupabaseAdmin } from "@/lib/supabase";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";

// toolExecutor.ts 구조 개편(2026-08-31) — quote/contract/conti 등 여러 domain executor가
// 공통으로 쓰는 작은 헬퍼만 모은다. domain 전용 로직(loadQuote 등)은 각자의 파일에 둔다
// (스펙 §9 "domain 파일마다 복사하지 않는다" — 반대로 공통이 아닌 걸 여기로 몰아넣지도 않는다).

export function text(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
}

// calendar.ts/workflow.ts/mailing.ts/gallery.ts, chatWorkTools.ts는 전부 레거시(Claude) 경로와
// 공유하는 {action:"done", message, ...} 모양으로 결과를 돌려준다 — v2가 기대하는
// {tool, success, data} 모양으로 한 곳에서만 변환한다.
export function fromLegacyResult(
  name: string,
  result: { action?: string; message: string; [key: string]: unknown },
): OliviaToolResult {
  const { message, action, ...rest } = result;
  return { tool: name, success: true, data: { message, ...rest } };
}

export function workspaceLabel(workspace: string) {
  return workspace === "quote" ? "견적서" : workspace === "contract" ? "계약서" : "콘티";
}

export function activeResource(context: OliviaContextSnapshot, workspace: "quote" | "conti" | "contract") {
  // PageContext의 현재 문서는 실제 화면이 등록한 값이므로, actionRouter가 이전 workspace
  // resource를 잠깐 보유하고 있더라도 이 값을 우선한다. 특히 ContractBuilder가 저장 직후
  // contractId를 등록한 렌더와 Olivia 요청 사이의 짧은 경합에서 존재하지 않는 이전 id를
  // 조회해 "현재 계약서를 불러오지 못했어요"가 발생하지 않게 한다.
  if (context.currentDocumentType === workspace && context.currentDocumentId) {
    return context.currentDocumentId;
  }
  if (context.activeWorkspace !== workspace || !context.activeResourceId) {
    throw new Error(`먼저 수정할 ${workspaceLabel(workspace)}를 열어주세요.`);
  }
  return context.activeResourceId;
}

export async function latestResource(workspace: "quote" | "contract" | "conti", context: OliviaContextSnapshot) {
  const db = getSupabaseAdmin();
  const config = workspace === "quote"
    ? { table: "quotes", date: "created_at" }
    : workspace === "conti"
      ? { table: "conti_saves", date: "saved_at" }
      : { table: "contracts", date: "created_at" };
  let query = db.from(config.table).select("*").order(config.date, { ascending: false }).limit(1);
  if (context.activeProjectId) query = query.eq("workflow_run_id", context.activeProjectId);
  else if (context.activeClientId) query = query.eq("client_id", context.activeClientId);
  else if (context.activeClientName) query = query.eq("hospital_name", context.activeClientName);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`${workspaceLabel(workspace)} 데이터를 확인하지 못했어요.`);
  return data as Record<string, unknown> | null;
}

// OLIVIA OS Phase 3 — 창 조작 3종은 서버가 아무것도 조회/계산할 필요가 없다(파라미터도 없다).
// 실제 동작(어떤 창을 movement/close/minimize할지)은 클라이언트 actionRouter.ts가
// useOliviaDesktopStore의 activeWindowId를 보고 판단한다 — 여기서는 "이 의도가 맞다"만
// 확인해준다.
const WINDOW_TOOL_NAMES = ["maximize_active_window", "close_active_window", "minimize_active_window"] as const;

export const COMMON_TOOL_NAMES = ["show_workspace", ...WINDOW_TOOL_NAMES] as const;

export async function executeCommonTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  if (name === "show_workspace") {
    const workspace = text(input, "workspace") as "quote" | "contract" | "conti" | "photo-sort";
    if (!(["quote", "contract", "conti", "photo-sort"] as const).includes(workspace)) throw new Error("지원하지 않는 작업 화면이에요.");
    if (workspace === "photo-sort") {
      return { tool: name, success: true, data: { workspace } };
    }
    const resource = await latestResource(workspace, context);
    if (!resource?.id) throw new Error(`현재 프로젝트의 ${workspaceLabel(workspace)}를 찾지 못했어요.`);
    return { tool: name, success: true, data: { workspace, resourceId: String(resource.id) } };
  }
  if ((WINDOW_TOOL_NAMES as readonly string[]).includes(name)) {
    return { tool: name, success: true, data: {} };
  }
  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
