// 해시태그/키워드 검색은 인기 태그를 노리는 공동구매(공구) 등 무관한 콘텐츠도 같이 딸려온다.
// 병원 연관성이 뚜렷한 게시물만 남기기 위한 휴리스틱 필터.

const NEGATIVE_SIGNALS = [
  "공구", "공동구매", "할인가", "특가", "무료배송", "완판", "재입고", "오픈런",
  "구매링크", "쿠폰", "적립금", "폭탄세일", "선착순", "품절임박", "체험단모집",
  "협찬", "주문폭주", "타임세일", "제품리뷰", "언박싱",
];

const POSITIVE_SIGNALS = [
  "병원", "의원", "원장", "클리닉", "진료", "상담", "시술", "수술", "치료",
  "검진", "간호사", "의사", "메디컬", "닥터", "환자", "리프팅", "레이저",
  "쌍꺼풀", "안면윤곽", "지방이식", "여드름", "도수치료", "한약", "추나",
  "임플란트", "라식", "라섹", "디스크", "재활",
];

export function isHospitalRelevantContent(caption: string, hashtags: string[] = []): boolean {
  const text = `${caption} ${hashtags.join(" ")}`;
  const hasNegative = NEGATIVE_SIGNALS.some((s) => text.includes(s));
  const hasPositive = POSITIVE_SIGNALS.some((s) => text.includes(s));
  return hasPositive && !hasNegative;
}
