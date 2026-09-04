// OLIVIA OS Phase 3 §27/§28 — 모든 기능을 나열하지 않고, 지금 포커스된 앱에 맞는 것만 최대
// 3개. 매핑 없는 appId(또는 Desktop에 포커스된 창이 없는 경우)는 OliviaConversation.tsx가
// 기존 4개 기본 제안으로 그대로 폴백한다.
export const DESKTOP_APP_SUGGESTIONS: Partial<Record<string, string[]>> = {
  customer: ["견적 만들기", "최근 프로젝트", "일정 보기"],
  calendar: ["오늘 일정", "내일 일정", "촬영 일정"],
  "photo-workspace": ["분류 시작", "RAW 매칭", "사진 검색"],
  documents: ["최근 문서", "견적서", "계약서"],
};
