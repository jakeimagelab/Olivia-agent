import {
  categoriesForProjectType,
  DEFAULT_PERSON_SELECT_RETOUCH_OPTIONS,
  isPersonSelectAccessMode,
  isPersonSelectCustomerViewMode,
  isPersonSelectProjectType,
  NEUTRAL_PERSON_SELECT_EXTRA_MAX,
  NEUTRAL_PERSON_SELECT_EXTRA_PRICE,
  NEUTRAL_PERSON_SELECT_NOTICE,
  NEUTRAL_PERSON_SELECT_OFFERS,
  type PersonSelectAccessMode,
  type PersonSelectCustomerViewMode,
  type PersonSelectProjectType,
} from "./types";

export const PERSON_SELECT_PROJECT_TYPE_LABELS: Record<PersonSelectProjectType, string> = {
  general: "일반 프로젝트",
  school: "학교",
  medical: "병원·의료",
  business: "기업·협회",
};

export const PERSON_SELECT_ACCESS_MODE_LABELS: Record<PersonSelectAccessMode, string> = {
  individual: "개인별 로그인",
  project_shared: "프로젝트 공용 링크",
};

export const PERSON_SELECT_CUSTOMER_VIEW_LABELS: Record<PersonSelectCustomerViewMode, string> = {
  classic: "기존 방식",
  bridge: "Bridge 방식",
};

export function normalizePersonSelectProjectSettings(input: Record<string, unknown>) {
  const projectType = isPersonSelectProjectType(input.project_type) ? input.project_type : "general";
  const accessMode = isPersonSelectAccessMode(input.access_mode) ? input.access_mode : "individual";
  const customerViewMode = isPersonSelectCustomerViewMode(input.customer_view_mode) ? input.customer_view_mode : "classic";
  return { projectType, accessMode, customerViewMode };
}

export function newPersonSelectProjectDefaults(projectType: PersonSelectProjectType) {
  return {
    categories: categoriesForProjectType(projectType),
    retouch_options: DEFAULT_PERSON_SELECT_RETOUCH_OPTIONS.map((option) => ({ ...option })),
    offer_notice: NEUTRAL_PERSON_SELECT_NOTICE,
    extra_price: NEUTRAL_PERSON_SELECT_EXTRA_PRICE,
    extra_max: NEUTRAL_PERSON_SELECT_EXTRA_MAX,
    offers: NEUTRAL_PERSON_SELECT_OFFERS,
    source_layout: projectType === "school" ? "school" as const : "person-folders" as const,
  };
}

export function accessModeChangeProblem(input: {
  current: PersonSelectAccessMode;
  next: PersonSelectAccessMode;
  peopleCount: number;
  imageCount?: number;
  choiceCount: number;
  sharedDraftCount?: number;
  sharedSelectionCount: number;
  accessedPeopleCount?: number;
  submittedPeopleCount?: number;
  orderPeopleCount?: number;
  ownedImageCount?: number;
  groupImageCount?: number;
  unassignedImageCount?: number;
  ownersWithoutPinCount?: number;
  groupsWithoutEligiblePeopleCount?: number;
}) {
  const assessment = assessAccessModeChange(input);
  return assessment.allowed ? null : assessment.reason;
}

export type AccessModeChangeFacts = {
  peopleCount: number;
  imageCount: number;
  choiceCount: number;
  sharedDraftCount: number;
  sharedSelectionCount: number;
  accessedPeopleCount: number;
  submittedPeopleCount: number;
  orderPeopleCount: number;
  ownedImageCount: number;
  groupImageCount: number;
  unassignedImageCount: number;
  ownersWithoutPinCount: number;
  groupsWithoutEligiblePeopleCount: number;
};

export type AccessModeChangeAssessment =
  | { allowed: true; requiresConfirmation: boolean; warning: string | null }
  | { allowed: false; requiresConfirmation: false; reason: string };

const FACT_KEYS = [
  "peopleCount",
  "imageCount",
  "choiceCount",
  "sharedDraftCount",
  "sharedSelectionCount",
  "accessedPeopleCount",
  "submittedPeopleCount",
  "orderPeopleCount",
  "ownedImageCount",
  "groupImageCount",
  "unassignedImageCount",
  "ownersWithoutPinCount",
  "groupsWithoutEligiblePeopleCount",
] as const satisfies readonly (keyof AccessModeChangeFacts)[];

export function normalizeAccessModeChangeFacts(input: unknown): AccessModeChangeFacts {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return Object.fromEntries(FACT_KEYS.map((key) => [key, Math.max(0, Number(source[key]) || 0)])) as AccessModeChangeFacts;
}

export function assessAccessModeChange(input: {
  current: PersonSelectAccessMode;
  next: PersonSelectAccessMode;
} & Partial<AccessModeChangeFacts>): AccessModeChangeAssessment {
  if (input.current === input.next) return { allowed: true, requiresConfirmation: false, warning: null };
  const facts = normalizeAccessModeChangeFacts(input);

  if (input.current === "individual" && input.next === "project_shared") {
    const blockers = [
      facts.submittedPeopleCount ? `제출 완료한 참가자가 ${facts.submittedPeopleCount}명 있습니다.` : "",
      facts.choiceCount ? `개인별 선택·메모·보정 요청이 ${facts.choiceCount}건 있습니다.` : "",
      facts.orderPeopleCount ? `추가 주문 내역이 있는 참가자가 ${facts.orderPeopleCount}명 있습니다.` : "",
      facts.accessedPeopleCount ? `이미 개인 링크에 접속한 참가자가 ${facts.accessedPeopleCount}명 있습니다.` : "",
    ].filter(Boolean);
    if (blockers.length) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: `${blockers.join(" ")} 기존 개인 활동을 공용 선택으로 임의 변환할 수 없어 접근 방식 변경을 막았습니다.`,
      };
    }
    const requiresConfirmation = facts.peopleCount > 0 || facts.ownedImageCount > 0 || facts.groupImageCount > 0;
    return {
      allowed: true,
      requiresConfirmation,
      warning: requiresConfirmation
        ? "이 프로젝트의 사진을 공용 링크를 사용하는 모든 담당자가 볼 수 있습니다. 기존 참가자와 사진 소유 관계는 삭제하지 않고 보존됩니다. 계속할까요?"
        : null,
    };
  }

  if (facts.sharedSelectionCount > 0) {
    return { allowed: false, requiresConfirmation: false, reason: `공용 링크로 제출된 선택 결과가 ${facts.sharedSelectionCount}건 있어 개인별 로그인으로 자동 변환할 수 없습니다.` };
  }
  if (facts.sharedDraftCount > 0) {
    return { allowed: false, requiresConfirmation: false, reason: "저장 중인 공용 선택 초안이 있어 개인별 로그인으로 바꿀 수 없습니다." };
  }
  if (facts.unassignedImageCount > 0) {
    return { allowed: false, requiresConfirmation: false, reason: `개인 또는 그룹 소유자가 지정되지 않은 사진이 ${facts.unassignedImageCount}장 있어 개인별 로그인으로 바꿀 수 없습니다.` };
  }
  if (facts.ownersWithoutPinCount > 0) {
    return { allowed: false, requiresConfirmation: false, reason: `PIN이 없거나 유효하지 않은 사진 소유자가 ${facts.ownersWithoutPinCount}명 있어 개인별 로그인으로 바꿀 수 없습니다.` };
  }
  if (facts.groupsWithoutEligiblePeopleCount > 0) {
    return { allowed: false, requiresConfirmation: false, reason: `PIN이 있는 참가자에게 연결되지 않은 사진 그룹이 ${facts.groupsWithoutEligiblePeopleCount}개 있어 개인별 로그인으로 바꿀 수 없습니다.` };
  }
  return { allowed: true, requiresConfirmation: false, warning: null };
}

export function isIndividualPersonSelectAccessAllowed(accessMode: unknown) {
  return accessMode === undefined || accessMode === null || accessMode === "individual";
}
