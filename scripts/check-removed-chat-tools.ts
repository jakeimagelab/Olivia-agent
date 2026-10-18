import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

export const REMOVED_MODEL_CHAT_TOOLS = [
  "get_conti_status", "create_conti", "add_conti_shots", "update_conti_shot",
  "remove_conti_shot", "reorder_conti_shot", "duplicate_conti_shot",
  "estimate_conti_duration", "generate_shoot_prep_from_conti", "create_conti_v2",
  "get_conti_v2", "get_conti_field_view_v2", "preview_conti_v2", "add_conti_scene_v2",
  "update_conti_scene_v2", "reorder_conti_scene_v2", "request_remove_conti_scene_v2",
  "complete_conti_v2", "memo_add", "memo_create", "memo_get", "memo_list",
  "memo_search", "memo_update", "work_create", "work_complete", "work_list_today",
  "work_journal_create", "work_journal_get", "work_journal_list", "work_journal_search",
  "work_journal_update", "work_journal_complete", "email_search", "email_read",
  "email_summarize", "email_create_draft", "list_mailing_queue", "send_mailing",
  "list_upcoming_meetings", "prepare_meeting_brief", "complete_meeting",
  "get_meeting_followups", "analyze_meeting_memo", "link_meeting_client",
  "brand_analysis_run", "brand_analysis_get_latest", "brand_analysis_preview",
  "run_brand_diagnosis", "trend_analysis_run", "trend_analysis_get_latest",
  "trend_analysis_preview", "create_gallery", "get_gallery", "start_task_session",
  "continue_task_session", "pause_task_session", "get_task_session_status",
  "create_feature_record", "update_feature_record", "get_today_briefing",
  "get_urgent_insights",
] as const;

export const REMOVED_APPROVAL_CHAT_TOOLS = [
  "apply_remove_conti_shot",
  "remove_conti_scene_v2",
  "apply_send_mailing",
  "apply_feature_record_write",
] as const;

const SEARCH_ROOTS = ["lib/olivia/v2", "lib/hermes", "app/api/olivia/v2"];
const removed = [...REMOVED_MODEL_CHAT_TOOLS, ...REMOVED_APPROVAL_CHAT_TOOLS];
const repoRoot = resolve(import.meta.dirname, "..");

function trackedFiles(root: string) {
  const absolute = resolve(repoRoot, root);
  if (!statSync(absolute).isDirectory()) return [];
  return execFileSync("rg", ["--files", root], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

const hits: Array<{ tool: string; file: string; count: number }> = [];
for (const file of SEARCH_ROOTS.flatMap(trackedFiles)) {
  const source = readFileSync(resolve(repoRoot, file), "utf8");
  for (const tool of removed) {
    const count = source.split(tool).length - 1;
    if (count > 0) hits.push({ tool, file, count });
  }
}

console.log(`removed model tools: ${REMOVED_MODEL_CHAT_TOOLS.length}`);
console.log(`removed approval tools: ${REMOVED_APPROVAL_CHAT_TOOLS.length}`);
console.log(`remaining occurrences: ${hits.reduce((sum, hit) => sum + hit.count, 0)}`);
for (const hit of hits) console.log(`${hit.tool}\t${hit.count}\t${hit.file}`);

if (hits.length > 0) process.exitCode = 1;
