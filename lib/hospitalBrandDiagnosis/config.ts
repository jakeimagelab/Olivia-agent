import type { DiagnosisChannel, VisualCategory } from "./types";

export const HBD_ALGORITHM_VERSION = "brand-diagnosis-v1";
export const HBD_STORAGE_BUCKET = "hospital-brand-diagnosis";

export const HBD_CHANNEL_LABEL: Record<DiagnosisChannel, string> = {
  website: "홈페이지",
  naver_place: "네이버 플레이스",
  naver_blog: "네이버 블로그",
  instagram: "인스타그램",
  youtube: "유튜브",
  other: "기타 채널",
};

export const HBD_CHANNEL_ROLE: Record<DiagnosisChannel, string> = {
  website: "병원의 공식 정보와 구조적인 신뢰",
  naver_place: "방문 결정과 실제 공간 확인",
  naver_blog: "진료 정보와 환자 질문에 대한 자세한 설명",
  instagram: "병원의 지속적인 활동과 빠른 콘텐츠 전달",
  youtube: "의료진의 설명과 깊이 있는 정보 전달",
  other: "선택한 채널의 보조적인 역할",
};

export const HBD_VISUAL_CATEGORY_LABEL: Record<VisualCategory, string> = {
  doctor_profile: "의료진 프로필",
  staff_group: "직원 단체",
  consultation: "상담 장면",
  treatment: "진료/시술 장면",
  examination: "검사 장면",
  medical_equipment: "의료 장비",
  interior: "인테리어",
  exterior: "외관",
  wayfinding: "안내/사인",
  patient_information: "환자 안내 정보",
  graphic_card: "카드뉴스/그래픽",
  product: "제품/상품",
  video_thumbnail: "영상 썸네일",
  other: "기타",
};

// AI 응답에서 이 표현들이 나오면 서버에서 한 번 더 걸러낸다 (섹션 12/21 금지 문구 안전망).
export const HBD_FORBIDDEN_PHRASE_PATTERNS: RegExp[] = [
  /새로\s*촬영/, /추가\s*촬영/, /전문\s*촬영.{0,4}(추천|권장)/, /포토클리닉.{0,6}(촬영|상담)/,
  /다시\s*촬영/, /추천\s*(촬영\s*)?패키지/, /촬영\s*구성.{0,4}추천/, /견적/, /촬영\s*상담/,
  /상위\s*노출/, /검색\s*순위\s*(상승|향상)/, /반드시\s*인용/, /유입\s*증가.{0,4}보장/, /최적화\s*완료/,
];

export function stripForbiddenPhrases(text: string): string {
  if (!text) return text;
  let cleaned = text;
  for (const pattern of HBD_FORBIDDEN_PHRASE_PATTERNS) {
    if (pattern.test(cleaned)) {
      // 문장 단위로 제거 — 문장 전체를 날리는 대신 해당 문장만 빈 문자열로 치환.
      cleaned = cleaned
        .split(/(?<=[.!?\n])/)
        .filter((sentence) => !pattern.test(sentence))
        .join("");
    }
  }
  return cleaned.trim();
}

export const HBD_SYSTEM_PRINCIPLES = `당신은 병원의 온라인 브랜드 이미지를 분석하는 진단 시스템이다.

여기서 브랜드 이미지는 사진의 촬영 품질만 의미하지 않는다.
사진, 영상, 문구, 홈페이지, 네이버 플레이스, 블로그, 인스타그램 등에서 환자에게 전달되는 병원의 전체 인상을 의미한다.

새로운 사진 촬영이나 영상 제작을 권하지 마라.
촬영 서비스, 패키지, 견적 또는 상담을 안내하지 마라.

현재 보유한 콘텐츠의 재배치, 순서 변경, 설명 보완, 중복 제거, 캡션 개선 등 사용자가 직접 적용할 수 있는 방법을 우선 제시하라.

확인하지 못한 항목을 추정하지 마라.
확인할 수 없는 항목은 unavailableChecks에 기록하라.

각 판단은 제공된 자료에 근거해야 한다.
검색 노출, 검색 순위, AI 답변 인용 또는 방문자 증가를 보장하지 마라.

사진의 미적 완성도를 주관적으로 평가하기보다 해당 채널에서 정보와 신뢰를 전달하는 역할을 수행하는지 분석하라.

좋은 점을 먼저 인정하고, 그다음 부족한 정보와 즉시 수정 가능한 항목을 제시하라.`;
