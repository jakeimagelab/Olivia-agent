// 일정 제목의 키워드로 카테고리를 자동으로 추측한다("촬영"이 들어가면 촬영, "미팅"이 들어가면
// 고객 등). 이 5개 키(shooting/client/admin/personal/general)는 app/calendar/page.tsx의 CATS,
// app/api/olivia/v2/stream/route.ts의 시스템 프롬프트와 동기화돼야 한다 — 값을 추가/변경하면
// 거기도 같이 고친다.
export type CalendarCategoryKey = "shooting" | "client" | "admin" | "personal" | "general";

// 우선순위 순서 — 한 제목에 여러 카테고리 키워드가 섞여 있으면(예: "촬영 후 고객 미팅") 사진
// 스튜디오의 본업인 촬영을 최우선으로 판정한다.
// lib/calendarPaste.ts(클립보드 붙여넣기 파싱)도 예전엔 이 목록을 자체 정규식으로 따로 들고
// 있었다 — 여기로 합쳐서 하나의 기준만 쓴다("병원"은 개인 병원이 아니라 병원 고객사 방문을
// 뜻하는 경우가 훨씬 많아 client로 분류한다, calendarPaste.ts의 기존 판단을 그대로 따름).
const CATEGORY_KEYWORDS: Record<Exclude<CalendarCategoryKey, "general">, string[]> = {
  shooting: ["촬영", "콘티", "웨딩", "스냅", "프로필", "화보", "스튜디오", "로케이션", "리허설"],
  client:   ["상담", "미팅", "고객", "병원", "미팅룸", "방문", "컨설팅"],
  admin:    ["계약", "정산", "세금", "행정", "서류", "신고", "회계", "인수인계", "회의"],
  personal: ["개인", "가족", "휴가", "경조사"],
};

const CATEGORY_PRIORITY: Array<Exclude<CalendarCategoryKey, "general">> = ["shooting", "client", "admin", "personal"];

export function categorizeByTitle(title: string): CalendarCategoryKey {
  const text = title.trim();
  if (!text) return "general";
  for (const category of CATEGORY_PRIORITY) {
    if (CATEGORY_KEYWORDS[category].some((keyword) => text.includes(keyword))) return category;
  }
  return "general";
}
