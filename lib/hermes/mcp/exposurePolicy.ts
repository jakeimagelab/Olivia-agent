import type { ToolExecutionMode } from "@/lib/olivia/v2/toolExecutors/verification";

export type HermesToolPolicy = "open" | "approval" | "blocked";

// Olivia OS 2.0 — Hermes를 기본 Brain으로 전환(요청서 §6-7) — READ/WRITE_SAFE/WRITE_IMPORTANT/
// DANGEROUS 4단계를 기존 policy/mode 체계 위에 명시적으로 문서화한다(새 체계를 만들지 않는다):
//   READ            -> getHermesToolMode()가 "read"로 분류 -> 자동 실행
//   WRITE_SAFE       -> policy "open" + mode "mutation" (예: 메모/Draft 저장) -> 자동 실행
//   WRITE_IMPORTANT  -> APPROVAL_TOOLS(policy "approval") -> 승인 카드 필요, Hermes가 실행 확정 못함
//   DANGEROUS        -> BLOCKED_TOOLS 또는 DANGEROUS_NAME_PATTERN 매칭 -> Hermes에 노출조차 안 함
//
// DANGEROUS는 Prompt로 막지 않는다(요청서 §7 "코드 레벨에서 보호"). 파일 삭제/RAW 이동·삭제 같은
// 작업은 애초에 Tool로 등록되어 있지 않고, 사진 파이프라인의 실제 파일 조작은
// lib/photo-classifier/node/pathSafety.ts·sourceProjectPrep.ts가 filesystem 가드로 이미
// 강제한다(어떤 Tool도 그 함수를 우회할 수 없다). 이 파일은 "위험한 이름의 Tool을 실수로
// Hermes에 노출하는 것" 자체를 막는 두 번째 방어선이다 — 이름 패턴에 걸리면 개별적으로
// BLOCKED_TOOLS에 추가하는 걸 깜빡해도 자동으로 차단된다.
const DANGEROUS_NAME_PATTERN = /delete.*_?(raw|file|photo|document)|(raw|file|photo|document).*delete|move.*_raw|remove.*_raw|exec(ute)?_shell|run_shell|shell_command|system_config|format_disk/i;

export function isDangerousToolName(toolName: string): boolean {
  return DANGEROUS_NAME_PATTERN.test(toolName);
}

/** Canonical Desktop data와 갈라지는 legacy conti_saves 도구만 차단한다. */
export const BLOCKED_TOOLS = new Set([
  "get_conti_status", "create_conti", "add_conti_shots", "update_conti_shot",
  "remove_conti_shot", "reorder_conti_shot", "duplicate_conti_shot",
  "estimate_conti_duration", "generate_shoot_prep_from_conti",
]);

/** 아래 도구들은 변경을 실행하지 않고 기존 Olivia 승인 카드만 만든다. */
export const APPROVAL_TOOLS = new Set([
  "rebalance_quote_total", "request_quote_publish", "request_contract_publish",
  "request_remove_conti_scene_v2", "send_mailing",
  // §9 "최종 Rule 승인은 Olivia/User가 한다" — Hermes가 스스로 규칙을 확정할 수 없게 한다.
  "approve_agent_memory_rule",
]);

export const CLIENT_ONLY_TOOLS = new Set([
  "download_quote_pdf", "download_contract_pdf", "start_select_match_flow",
  "rename_photo_scene", "merge_photo_scenes", "split_photo_scene",
  "start_ai_photo_classification", "refine_photo_classification",
  "maximize_active_window", "close_active_window", "minimize_active_window",
]);

const UI_TOOLS = new Set([
  ...CLIENT_ONLY_TOOLS, "show_workspace", "open_feature", "open_document", "start_quote_wizard",
  "request_contract_signature", "preview_quote", "preview_contract", "preview_conti_v2",
  "brand_analysis_preview", "trend_analysis_preview",
]);

export function getHermesToolPolicy(toolName: string): HermesToolPolicy {
  if (isDangerousToolName(toolName) || BLOCKED_TOOLS.has(toolName)) return "blocked";
  if (APPROVAL_TOOLS.has(toolName)) return "approval";
  return "open";
}

export function getHermesToolMode(toolName: string, description = ""): ToolExecutionMode {
  if (getHermesToolPolicy(toolName) === "approval") return "approval";
  if (UI_TOOLS.has(toolName)) return "ui";
  if (/^\[READ\]/i.test(description) || /^(get|list|search|check|resolve|estimate)_/.test(toolName)
    || /_(get_latest|preview)$/.test(toolName)
    || ["email_read", "email_search", "email_summarize", "calendar_availability"].includes(toolName)) return "read";
  return "mutation";
}
