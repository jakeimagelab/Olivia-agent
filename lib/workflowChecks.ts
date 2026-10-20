import {
  ACTIVE_WORKFLOW_STEP_KEYS,
  getWorkflowDisplayStepKey,
  type ActiveWorkflowStepKey,
} from "@/lib/workflow";

export type WorkflowCheckActor = "auto" | "user";
export type WorkflowCheckGroup = "준비" | "촬영" | "사진" | "마무리";

export type WorkflowCheckState = {
  done: boolean;
  at?: string;
  by?: WorkflowCheckActor;
  label?: string;
};

export type WorkflowChecksState = Record<string, WorkflowCheckState>;

export type WorkflowCheckDefinition = {
  key: string;
  label: string;
  actor: WorkflowCheckActor;
  evidence: string;
  stepKey: ActiveWorkflowStepKey;
  group: WorkflowCheckGroup;
  nextActionLabel: string;
  actionLabel: string;
};

/**
 * 요청서 표에 적힌 고정 체크의 단일 원본이다.
 * custom_* 항목은 건별로 추가되며 이 목록과 단계 역산에는 포함하지 않는다.
 */
export const WORKFLOW_CHECKS: readonly WorkflowCheckDefinition[] = [
  { key: "quote_sent", label: "견적서 보냄", actor: "auto", evidence: "견적서 발송 기록", stepKey: "quote", group: "준비", nextActionLabel: "견적서를 만들어 고객에게 보내기", actionLabel: "견적서 열기" },
  { key: "client_portal", label: "고객 등록 · 포털 열림", actor: "auto", evidence: "고객 포털 생성 시각", stepKey: "quote", group: "준비", nextActionLabel: "고객을 등록하고 포털 열기", actionLabel: "포털 보기" },
  { key: "contract_signed", label: "계약서 받음", actor: "auto", evidence: "계약 서명 완료 시각", stepKey: "contract", group: "준비", nextActionLabel: "계약서를 보내고 서명 받기", actionLabel: "계약서 열기" },
  { key: "conti_made", label: "콘티 만듦", actor: "auto", evidence: "촬영 콘티 생성 기록", stepKey: "conti", group: "준비", nextActionLabel: "촬영 콘티 만들기", actionLabel: "콘티 열기" },
  { key: "conti_shared", label: "콘티 공유 · 체크 받음", actor: "user", evidence: "병원 공유 확인", stepKey: "conti", group: "준비", nextActionLabel: "콘티를 병원에 보내고 체크 받기", actionLabel: "공유 링크 보기" },
  { key: "prep_confirmed", label: "병원 준비사항 확인", actor: "user", evidence: "병원 준비사항 확인", stepKey: "conti", group: "준비", nextActionLabel: "병원 준비사항 확인하기", actionLabel: "준비사항 보기" },
  { key: "shot", label: "촬영", actor: "user", evidence: "촬영 완료 확인", stepKey: "shooting", group: "촬영", nextActionLabel: "촬영 완료 확인하기", actionLabel: "촬영 확인" },
  { key: "payment", label: "잔금 확인", actor: "user", evidence: "잔금 입금 확인", stepKey: "payment_confirm", group: "촬영", nextActionLabel: "잔금 입금 확인하기", actionLabel: "잔금 확인" },
  { key: "backup_sorted", label: "백업 · 자동 분류", actor: "auto", evidence: "NAS 백업 및 분류 완료", stepKey: "backup_sorting", group: "사진", nextActionLabel: "사진을 백업하고 자동 분류하기", actionLabel: "사진 작업 보기" },
  { key: "sort_approved", label: "분류 확인", actor: "user", evidence: "분류 결과 승인 시각", stepKey: "backup_sorting", group: "사진", nextActionLabel: "분류 결과를 확인하고 승인하기", actionLabel: "분류 결과 보기" },
  { key: "client_selected", label: "고객이 사진 고름", actor: "auto", evidence: "고객 사진 선택 제출 시각", stepKey: "client_selection", group: "사진", nextActionLabel: "고객의 사진 선택 기다리기", actionLabel: "셀렉 현황 보기" },
  { key: "raw_approved", label: "RAW 승인 · 복사", actor: "user", evidence: "Selected_RAW 복사 결과", stepKey: "raw_matching", group: "사진", nextActionLabel: "RAW 복사 결과를 확인하고 승인하기", actionLabel: "RAW 결과 보기" },
  { key: "retouched", label: "보정", actor: "user", evidence: "보정 완료 확인", stepKey: "retouching", group: "사진", nextActionLabel: "선택 사진 보정 완료하기", actionLabel: "보정 작업 열기" },
  { key: "final_delivered", label: "완료사진 전달", actor: "auto", evidence: "완료사진 갤러리 NAS 링크", stepKey: "final_delivery", group: "마무리", nextActionLabel: "완료사진을 고객에게 전달하기", actionLabel: "완료사진 보기" },
  { key: "feedback", label: "고객 피드백", actor: "auto", evidence: "고객 포털 피드백", stepKey: "revision", group: "마무리", nextActionLabel: "고객 피드백 기다리기", actionLabel: "피드백 보기" },
  { key: "revised", label: "수정", actor: "user", evidence: "수정 완료 확인", stepKey: "revision", group: "마무리", nextActionLabel: "수정 요청 반영하기", actionLabel: "수정 요청 보기" },
  { key: "reward", label: "후기 받고 리워드", actor: "auto", evidence: "후기 등록 및 포인트 적립", stepKey: "reward", group: "마무리", nextActionLabel: "후기를 받고 리워드 적립하기", actionLabel: "후기 · 리워드 보기" },
] as const;

export const WORKFLOW_CHECK_GROUPS: readonly WorkflowCheckGroup[] = ["준비", "촬영", "사진", "마무리"];

const DEFINITION_BY_KEY = new Map(WORKFLOW_CHECKS.map((definition) => [definition.key, definition]));

export function workflowCheckDefinition(key: string) {
  return DEFINITION_BY_KEY.get(key) ?? null;
}

export function normalizeWorkflowChecks(value: unknown): WorkflowChecksState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: WorkflowChecksState = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const candidate = raw as Record<string, unknown>;
    result[key] = {
      done: candidate.done === true,
      ...(typeof candidate.at === "string" && candidate.at ? { at: candidate.at } : {}),
      ...(candidate.by === "auto" || candidate.by === "user" ? { by: candidate.by } : {}),
      ...(typeof candidate.label === "string" && candidate.label.trim() ? { label: candidate.label.trim() } : {}),
    };
  }
  return result;
}

function firstCheckIndexForStep(stepKey: ActiveWorkflowStepKey) {
  const index = WORKFLOW_CHECKS.findIndex((check) => check.stepKey === stepKey);
  return index < 0 ? 0 : index;
}

/** DB를 바꾸지 않고 옛 current_step_key 앞의 체크만 완료로 보이게 한다. */
export function checksFromLegacyStep(currentStepKey: string | null | undefined, status?: string | null): WorkflowChecksState {
  const nowless: WorkflowChecksState = {};
  const displayStep = getWorkflowDisplayStepKey(currentStepKey || "quote") ?? "quote";
  const completedCount = status === "completed" ? WORKFLOW_CHECKS.length : firstCheckIndexForStep(displayStep);
  WORKFLOW_CHECKS.forEach((definition, index) => {
    nowless[definition.key] = { done: index < completedCount, by: definition.actor };
  });
  return nowless;
}

/** checks가 비어 있는 옛 건만 레거시 단계에서 읽고, DB에는 쓰지 않는다. */
export function effectiveWorkflowChecks(input: {
  checks: unknown;
  currentStepKey?: string | null;
  status?: string | null;
}): WorkflowChecksState {
  const stored = normalizeWorkflowChecks(input.checks);
  const hasStoredStandardCheck = WORKFLOW_CHECKS.some((definition) => definition.key in stored);
  if (hasStoredStandardCheck) return stored;
  return { ...checksFromLegacyStep(input.currentStepKey, input.status), ...stored };
}

export function workflowCheckProgress(checks: WorkflowChecksState) {
  const done = WORKFLOW_CHECKS.reduce((count, definition) => count + (checks[definition.key]?.done ? 1 : 0), 0);
  return { done, total: WORKFLOW_CHECKS.length, percent: Math.round((done / WORKFLOW_CHECKS.length) * 100) };
}

export function nextWorkflowCheck(checks: WorkflowChecksState) {
  return WORKFLOW_CHECKS.find((definition) => !checks[definition.key]?.done) ?? null;
}

export function deriveWorkflowPosition(checks: WorkflowChecksState): {
  currentStepKey: ActiveWorkflowStepKey;
  status: "active" | "completed";
} {
  const next = nextWorkflowCheck(checks);
  return next
    ? { currentStepKey: next.stepKey, status: "active" }
    : { currentStepKey: ACTIVE_WORKFLOW_STEP_KEYS[ACTIVE_WORKFLOW_STEP_KEYS.length - 1], status: "completed" };
}

export function setWorkflowCheck(input: {
  checks: WorkflowChecksState;
  key: string;
  done: boolean;
  by: WorkflowCheckActor;
  at?: string;
  label?: string;
}): WorkflowChecksState {
  const next = { ...normalizeWorkflowChecks(input.checks) };
  next[input.key] = {
    done: input.done,
    by: input.by,
    ...(input.done ? { at: input.at ?? new Date().toISOString() } : {}),
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
  };
  return next;
}

export function isCustomWorkflowCheckKey(key: string) {
  return /^custom_[a-z0-9]{6}$/.test(key);
}

export function waitingDays(updatedAt: string | null | undefined, now = new Date()) {
  const then = updatedAt ? new Date(updatedAt).getTime() : Number.NaN;
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}
