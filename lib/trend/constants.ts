export const TREND_INDUSTRIES = ["피부과", "성형외과", "한의원", "정형외과", "기타"] as const;
export type TrendIndustry = (typeof TREND_INDUSTRIES)[number];

// 업종별 기본 수집 키워드 (네이버 데이터랩 / 구글 트렌드 조회 시 사용)
export const DEFAULT_KEYWORDS_BY_INDUSTRY: Record<TrendIndustry, string[]> = {
  피부과: ["피부과 추천", "여드름 치료", "리프팅 시술", "레이저 토닝"],
  성형외과: ["성형외과 추천", "쌍꺼풀 수술", "안면윤곽", "지방이식"],
  한의원: ["한의원 추천", "다이어트 한약", "추나요법", "체질 개선"],
  정형외과: ["정형외과 추천", "도수치료", "무릎 통증", "체외충격파"],
  기타: ["병원 마케팅", "의료광고"],
};

export function industryOrDefault(v: string | null | undefined): TrendIndustry {
  return (TREND_INDUSTRIES as readonly string[]).includes(v || "")
    ? (v as TrendIndustry)
    : "기타";
}
