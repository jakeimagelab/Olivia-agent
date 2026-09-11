import type { ToolExecutionMode } from "@/lib/olivia/v2/toolExecutors/verification";

export type HermesToolPolicy = "open" | "approval" | "blocked";

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
  if (BLOCKED_TOOLS.has(toolName)) return "blocked";
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
