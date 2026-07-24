import {
  ASSISTANT_ACTION_STATUSES,
  ASSISTANT_CHANNELS,
  ASSISTANT_CONFIRMATION_STATUSES,
  ASSISTANT_NOTIFICATION_PRIORITIES,
  ASSISTANT_ROLES,
  type AssistantActionStatus,
  type AssistantChannel,
  type AssistantConfirmationStatus,
  type AssistantNotificationPriority,
  type AssistantRole,
} from "@/lib/assistant/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_ACTION_NAME_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

export class AssistantValidationError extends Error {
  readonly code = "INVALID_INPUT";

  constructor(message: string) {
    super(message);
    this.name = "AssistantValidationError";
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function requireUuid(value: unknown, label: string): string {
  if (!isUuid(value)) throw new AssistantValidationError(`${label} 값이 올바르지 않습니다.`);
  return value;
}

export function parseAssistantChannel(value: unknown): AssistantChannel {
  if (!ASSISTANT_CHANNELS.includes(value as AssistantChannel)) {
    throw new AssistantValidationError("지원하지 않는 메시지 채널입니다.");
  }
  return value as AssistantChannel;
}

export function parseAssistantRole(value: unknown): AssistantRole {
  if (!ASSISTANT_ROLES.includes(value as AssistantRole)) {
    throw new AssistantValidationError("지원하지 않는 권한입니다.");
  }
  return value as AssistantRole;
}

export function parseAssistantActionStatus(value: unknown): AssistantActionStatus {
  if (!ASSISTANT_ACTION_STATUSES.includes(value as AssistantActionStatus)) {
    throw new AssistantValidationError("지원하지 않는 Action 상태입니다.");
  }
  return value as AssistantActionStatus;
}

export function parseAssistantConfirmationStatus(
  value: unknown,
): AssistantConfirmationStatus {
  if (
    !ASSISTANT_CONFIRMATION_STATUSES.includes(
      value as AssistantConfirmationStatus,
    )
  ) {
    throw new AssistantValidationError("지원하지 않는 승인 상태입니다.");
  }
  return value as AssistantConfirmationStatus;
}

export function parseAssistantNotificationPriority(
  value: unknown,
): AssistantNotificationPriority {
  if (
    !ASSISTANT_NOTIFICATION_PRIORITIES.includes(
      value as AssistantNotificationPriority,
    )
  ) {
    throw new AssistantValidationError("지원하지 않는 알림 중요도입니다.");
  }
  return value as AssistantNotificationPriority;
}

export function requireText(
  value: unknown,
  label: string,
  options: { min?: number; max: number },
): string {
  if (typeof value !== "string") {
    throw new AssistantValidationError(`${label}을 입력해 주세요.`);
  }
  const normalized = value.trim();
  const min = options.min ?? 1;
  if (normalized.length < min || normalized.length > options.max) {
    throw new AssistantValidationError(
      `${label}은 ${min}~${options.max}자로 입력해 주세요.`,
    );
  }
  return normalized;
}

export function optionalText(
  value: unknown,
  label: string,
  max: number,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length > max) {
    throw new AssistantValidationError(`${label}은 최대 ${max}자까지 입력할 수 있습니다.`);
  }
  return value.trim();
}

export function requireActionName(value: unknown): string {
  const actionName = requireText(value, "Action 이름", { max: 120 });
  if (!SAFE_ACTION_NAME_PATTERN.test(actionName)) {
    throw new AssistantValidationError("Action 이름 형식이 올바르지 않습니다.");
  }
  return actionName;
}

export function requireIsoDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    throw new AssistantValidationError(`${label} 날짜 형식이 올바르지 않습니다.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new AssistantValidationError(`${label} 날짜가 존재하지 않습니다.`);
  }
  return value;
}

export function validateDateOrder(
  startDate: unknown,
  dueDate: unknown,
): { startDate?: string; dueDate?: string } {
  const start = startDate ? requireIsoDate(startDate, "시작일") : undefined;
  const due = dueDate ? requireIsoDate(dueDate, "마감일") : undefined;
  if (start && due && start > due) {
    throw new AssistantValidationError("시작일은 마감일보다 늦을 수 없습니다.");
  }
  return { startDate: start, dueDate: due };
}

export function requireRecord(
  value: unknown,
  label = "요청 데이터",
  maxSerializedBytes = 100_000,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AssistantValidationError(`${label} 형식이 올바르지 않습니다.`);
  }
  let serialized = "";
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new AssistantValidationError(`${label}을 읽을 수 없습니다.`);
  }
  if (Buffer.byteLength(serialized, "utf8") > maxSerializedBytes) {
    throw new AssistantValidationError(`${label}의 크기가 너무 큽니다.`);
  }
  return value as Record<string, unknown>;
}

export function sanitizeRequestId(value: unknown): string {
  const requestId = requireText(value, "요청 ID", { max: 160 });
  if (!/^[A-Za-z0-9._:-]+$/.test(requestId)) {
    throw new AssistantValidationError("요청 ID 형식이 올바르지 않습니다.");
  }
  return requestId;
}
