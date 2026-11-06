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
}) {
  if (input.current === input.next) return null;
  if (input.peopleCount > 0 || (input.imageCount ?? 0) > 0 || input.choiceCount > 0 || (input.sharedDraftCount ?? 0) > 0 || input.sharedSelectionCount > 0) {
    return "이미 사진, 참가자 또는 선택 내역이 있어 접근 방식을 바꿀 수 없습니다.";
  }
  return null;
}
