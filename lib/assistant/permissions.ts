import type {
  AssistantChannel,
  AssistantRole,
} from "@/lib/assistant/types";

const ROLE_WEIGHT: Record<AssistantRole, number> = {
  READ_ONLY: 0,
  STAFF: 1,
  ADMIN: 2,
  OWNER: 3,
};

const READ_ACTION_PATTERNS = [
  /\.search$/,
  /\.list$/,
  /\.read$/,
  /\.summarize$/,
  /\.getStatus$/,
  /\.getAvailability$/,
  /^briefing\.generate$/,
];

const ALWAYS_CONFIRM_ACTIONS = new Set([
  "calendar.create",
  "calendar.update",
  "calendar.cancel",
  "email.send",
  "client.update",
  "quote.finalize",
  "contract.create",
  "contract.update",
  "file.delete",
  "file.move",
  "photo.moveOriginal",
  "photo.deleteFromNas",
]);

const OWNER_ONLY_ACTIONS = new Set([
  "email.send",
  "client.update",
  "quote.finalize",
  "contract.create",
  "contract.update",
  "file.delete",
  "file.move",
  "photo.moveOriginal",
  "photo.deleteFromNas",
]);

export function canRoleExecute(
  actorRole: AssistantRole,
  requiredRole: AssistantRole,
): boolean {
  return ROLE_WEIGHT[actorRole] >= ROLE_WEIGHT[requiredRole];
}

export function requiredRoleForAction(actionName: string): AssistantRole {
  if (OWNER_ONLY_ACTIONS.has(actionName)) return "OWNER";
  if (READ_ACTION_PATTERNS.some((pattern) => pattern.test(actionName))) {
    return "READ_ONLY";
  }
  return "STAFF";
}

export function actionRequiresConfirmation(
  actionName: string,
  _channel: AssistantChannel,
): boolean {
  if (ALWAYS_CONFIRM_ACTIONS.has(actionName)) return true;
  if (READ_ACTION_PATTERNS.some((pattern) => pattern.test(actionName))) {
    return false;
  }
  return false;
}

export function isOwnerOnlyAction(actionName: string): boolean {
  return OWNER_ONLY_ACTIONS.has(actionName);
}
