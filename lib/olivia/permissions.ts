import type { OliviaPermissionLevel } from "@/lib/olivia/types";

const AUTO_ACTIONS = new Set([
  "create_agent_task",
  "update_next_action",
  "prepare_meeting_brief",
  "create_internal_reminder",
]);

const OWNER_ONLY_ACTIONS = new Set([
  "change_price",
  "change_discount",
  "change_contract_terms",
  "process_payment",
  "process_refund",
  "delete_file",
  "respond_to_complaint",
  "publish_external_content",
  "transfer_personal_data",
]);

export function getActionPermission(actionType: string): OliviaPermissionLevel {
  if (OWNER_ONLY_ACTIONS.has(actionType)) return "owner_only";
  if (AUTO_ACTIONS.has(actionType)) return "auto";
  return "review_required";
}

export function canRunWithoutApproval(permissionLevel: OliviaPermissionLevel) {
  return permissionLevel === "auto";
}

export function normalizePermission(
  actionType: string,
  requested?: OliviaPermissionLevel | null,
): OliviaPermissionLevel {
  const required = getActionPermission(actionType);
  if (required === "owner_only") return required;
  if (required === "review_required" && requested === "auto") return required;
  return requested ?? required;
}
