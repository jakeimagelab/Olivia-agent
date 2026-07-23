import {
  GOAL_STATUSES,
  PROJECT_MEMBER_ROLES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/components/team-workspace/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function optionalUuid(value: unknown, fieldName: string): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  return isUuid(value)
    ? { ok: true, value }
    : { ok: false, error: `${fieldName} 값이 올바르지 않습니다.` };
}

function optionalDate(value: unknown, fieldName: string): ValidationResult<string | null> {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    return { ok: false, error: `${fieldName} 형식이 올바르지 않습니다.` };
  }
  return { ok: true, value };
}

function dateRange(startDate: string | null, dueDate: string | null): string | null {
  return startDate && dueDate && startDate > dueDate
    ? "시작일은 마감일보다 늦을 수 없습니다."
    : null;
}

function oneOf<T extends readonly string[]>(value: unknown, values: T, fallback: T[number], fieldName: string): ValidationResult<T[number]> {
  const candidate = value ?? fallback;
  return typeof candidate === "string" && values.includes(candidate)
    ? { ok: true, value: candidate as T[number] }
    : { ok: false, error: `허용되지 않은 ${fieldName}입니다.` };
}

export type ProjectInput = {
  name: string;
  description: string | null;
  projectType: (typeof PROJECT_TYPES)[number];
  status: (typeof PROJECT_STATUSES)[number];
  priority: (typeof TASK_PRIORITIES)[number];
  clientId: string | null;
  workflowRunId: string | null;
  ownerId: string | null;
  startDate: string | null;
  dueDate: string | null;
  createChatRoom: boolean;
  memberIds: string[];
};

export function validateProjectInput(input: unknown): ValidationResult<ProjectInput> {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  if (!name || name.length > 200) return { ok: false, error: "프로젝트명은 1~200자로 입력해주세요." };
  if (description && description.length > 10000) return { ok: false, error: "설명은 10000자 이하로 입력해주세요." };

  const projectType = oneOf(body.projectType ?? body.project_type, PROJECT_TYPES, "internal", "프로젝트 유형");
  const status = oneOf(body.status, PROJECT_STATUSES, "planning", "프로젝트 상태");
  const priority = oneOf(body.priority, TASK_PRIORITIES, "normal", "우선순위");
  const clientId = optionalUuid(body.clientId ?? body.client_id, "고객");
  const workflowRunId = optionalUuid(body.workflowRunId ?? body.workflow_run_id, "워크플로우");
  const ownerId = optionalUuid(body.ownerId ?? body.owner_id, "책임자");
  const startDate = optionalDate(body.startDate ?? body.start_date, "시작일");
  const dueDate = optionalDate(body.dueDate ?? body.due_date, "마감일");
  if (!projectType.ok) return projectType;
  if (!status.ok) return status;
  if (!priority.ok) return priority;
  if (!clientId.ok) return clientId;
  if (!workflowRunId.ok) return workflowRunId;
  if (!ownerId.ok) return ownerId;
  if (!startDate.ok) return startDate;
  if (!dueDate.ok) return dueDate;
  const rangeError = dateRange(startDate.value, dueDate.value);
  if (rangeError) return { ok: false, error: rangeError };

  const rawMemberIds = Array.isArray(body.memberIds) ? body.memberIds : [];
  if (rawMemberIds.some((id) => !isUuid(id))) return { ok: false, error: "프로젝트 멤버 값이 올바르지 않습니다." };
  return {
    ok: true,
    value: {
      name,
      description,
      projectType: projectType.value,
      status: status.value,
      priority: priority.value,
      clientId: clientId.value,
      workflowRunId: workflowRunId.value,
      ownerId: ownerId.value,
      startDate: startDate.value,
      dueDate: dueDate.value,
      createChatRoom: body.createChatRoom !== false,
      memberIds: Array.from(new Set(rawMemberIds as string[])),
    },
  };
}

export type TaskInput = {
  title: string;
  description: string | null;
  assigneeId: string | null;
  projectId: string | null;
  roomId: string | null;
  sourceMessageId: string | null;
  priority: (typeof TASK_PRIORITIES)[number];
  status: (typeof TASK_STATUSES)[number];
  startDate: string | null;
  dueDate: string | null;
  checklist: string[];
};

export function validateTaskInput(input: unknown): ValidationResult<TaskInput> {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  if (!title || title.length > 200) return { ok: false, error: "업무 제목은 1~200자로 입력해주세요." };
  if (description && description.length > 10000) return { ok: false, error: "업무 설명은 10000자 이하로 입력해주세요." };

  const assigneeId = optionalUuid(body.assigneeId ?? body.assignee_id, "담당자");
  const projectId = optionalUuid(body.projectId ?? body.project_id, "프로젝트");
  const roomId = optionalUuid(body.roomId ?? body.room_id, "채팅방");
  const sourceMessageId = optionalUuid(body.sourceMessageId ?? body.source_message_id, "원본 메시지");
  const priority = oneOf(body.priority, TASK_PRIORITIES, "normal", "우선순위");
  const status = oneOf(body.status, TASK_STATUSES, "todo", "업무 상태");
  const startDate = optionalDate(body.startDate ?? body.start_date, "시작일");
  const dueDate = optionalDate(body.dueDate ?? body.due_date, "마감일");
  if (!assigneeId.ok) return assigneeId;
  if (!projectId.ok) return projectId;
  if (!roomId.ok) return roomId;
  if (!sourceMessageId.ok) return sourceMessageId;
  if (!priority.ok) return priority;
  if (!status.ok) return status;
  if (!startDate.ok) return startDate;
  if (!dueDate.ok) return dueDate;
  const rangeError = dateRange(startDate.value, dueDate.value);
  if (rangeError) return { ok: false, error: rangeError };

  const rawChecklist = Array.isArray(body.checklist) ? body.checklist : [];
  const checklist = rawChecklist.map((item) => String(item).trim()).filter(Boolean);
  if (checklist.some((item) => item.length > 500)) {
    return { ok: false, error: "체크리스트 항목은 500자 이하로 입력해주세요." };
  }
  return {
    ok: true,
    value: {
      title,
      description,
      assigneeId: assigneeId.value,
      projectId: projectId.value,
      roomId: roomId.value,
      sourceMessageId: sourceMessageId.value,
      priority: priority.value,
      status: status.value,
      startDate: startDate.value,
      dueDate: dueDate.value,
      checklist,
    },
  };
}

export function validateRevisionNote(value: unknown): ValidationResult<string> {
  const note = typeof value === "string" ? value.trim() : "";
  return note.length >= 1 && note.length <= 2000
    ? { ok: true, value: note }
    : { ok: false, error: "수정 요청 내용은 1~2000자로 입력해주세요." };
}

export function validateGoalInput(input: unknown): ValidationResult<{ title: string; successCriteria: string | null }> {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const successCriteria = typeof body.successCriteria === "string"
    ? body.successCriteria.trim() || null
    : typeof body.success_criteria === "string" ? body.success_criteria.trim() || null : null;
  if (!title || title.length > 200) return { ok: false, error: "오늘의 핵심 목표는 1~200자로 입력해주세요." };
  if (successCriteria && successCriteria.length > 2000) return { ok: false, error: "완료 기준은 2000자 이하로 입력해주세요." };
  return { ok: true, value: { title, successCriteria } };
}

export function validateGoalResult(input: unknown): ValidationResult<{ status: (typeof GOAL_STATUSES)[number]; resultNote: string | null }> {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const status = oneOf(body.status, GOAL_STATUSES, "planned", "오늘의 결과");
  if (!status.ok || status.value === "planned") return { ok: false, error: "오늘의 결과를 선택해주세요." };
  const resultNote = typeof body.resultNote === "string"
    ? body.resultNote.trim() || null
    : typeof body.result_note === "string" ? body.result_note.trim() || null : null;
  if (resultNote && resultNote.length > 2000) return { ok: false, error: "결과 보고는 2000자 이하로 입력해주세요." };
  return { ok: true, value: { status: status.value, resultNote } };
}

export function isProjectMemberRole(value: unknown): boolean {
  return typeof value === "string" && (PROJECT_MEMBER_ROLES as readonly string[]).includes(value);
}
