import type { AiTrustDataSourceStatus, AiTrustEvidenceSchemaKey, AiTrustIntent } from "./types";

export const AI_TRUST_INTENTS: { key: AiTrustIntent; label: string; desc: string }[] = [
  { key: "LOCATION", label: "지역 탐색", desc: "지역과 가까운 병원을 찾는 질문" },
  { key: "RECOMMENDATION", label: "추천/후기", desc: "추천, 평가, 후기 중심 질문" },
  { key: "SYMPTOM", label: "증상", desc: "증상에서 병원 선택으로 이어지는 질문" },
  { key: "TREATMENT", label: "시술", desc: "특정 진료/시술 기반 질문" },
  { key: "PRICE", label: "가격", desc: "비용, 가성비, 가격 비교 질문" },
  { key: "TRUST", label: "신뢰", desc: "불안, 과잉진료, 공장형 우려 질문" },
  { key: "CONDITION", label: "조건", desc: "야간진료, 외국어, 예약, 접근성 질문" },
];

export const AI_TRUST_EVIDENCE_SCHEMAS: { key: AiTrustEvidenceSchemaKey; label: string; desc: string }[] = [
  { key: "LOCATION_RELEVANCE", label: "지역 연관성", desc: "지역명, 거리, 역/상권 정보와의 연결" },
  { key: "INFORMATION_CLARITY", label: "병원 정보 명확성", desc: "진료 정보와 병원 소개의 명료함" },
  { key: "DOCTOR_INFORMATION", label: "의료진 정보", desc: "의료진 프로필, 경력, 상담 정보" },
  { key: "TREATMENT_INFORMATION", label: "진료/시술 정보", desc: "시술 설명, 대상, 과정, 주의사항" },
  { key: "REVIEW_EVIDENCE", label: "리뷰 증거", desc: "리뷰, 후기, 만족 포인트" },
  { key: "THIRD_PARTY_MENTIONS", label: "제3자 언급", desc: "언론, 플랫폼, 커뮤니티 등 외부 출처" },
  { key: "INFORMATION_CONSISTENCY", label: "정보 일관성", desc: "출처 간 정보 충돌 여부" },
  { key: "FRESHNESS", label: "최신성", desc: "최근 업데이트, 최근 콘텐츠 존재" },
  { key: "VISUAL_EVIDENCE", label: "이미지 증거", desc: "실제 공간, 상담, 장비, 의료진 이미지" },
  { key: "MULTILINGUAL_INFORMATION", label: "다국어 정보", desc: "외국어 안내, 해외 환자 정보" },
  { key: "PRICE_INFORMATION", label: "가격 정보", desc: "가격, 이벤트, 비용 안내" },
  { key: "BOOKING_ACCESSIBILITY", label: "예약 접근성", desc: "예약 방법, CTA, 상담 연결" },
];

export const AI_TRUST_DEMAND_SOURCES: {
  key: string;
  label: string;
  status: AiTrustDataSourceStatus;
  desc: string;
}[] = [
  { key: "GOOGLE_ADS", label: "Google Ads Keyword Data", status: "API_REQUIRED", desc: "검색량 수집은 API Key 연결 후 활성화" },
  { key: "GOOGLE_TRENDS", label: "Google Trends", status: "API_REQUIRED", desc: "트렌드 지수 수집용. 검색량으로 저장하지 않음" },
  { key: "NAVER_KEYWORD", label: "네이버 키워드 데이터", status: "API_REQUIRED", desc: "네이버 광고 API 연결 필요" },
  { key: "GOOGLE_RELATED", label: "Google 관련 검색", status: "NOT_CONNECTED", desc: "검색 결과 수집 모듈 미연결" },
  { key: "AUTOCOMPLETE", label: "검색 자동완성", status: "NOT_CONNECTED", desc: "자동완성 수집 모듈 미연결" },
  { key: "COMMUNITY_QA", label: "커뮤니티 질문 데이터", status: "NOT_CONNECTED", desc: "커뮤니티 수집 모듈 미연결" },
  { key: "LOCAL_SEARCH", label: "지역 검색 데이터", status: "NOT_CONNECTED", desc: "지역 검색 API 미연결" },
  { key: "MAP_SEARCH", label: "지도 검색 데이터", status: "NOT_CONNECTED", desc: "지도 API 미연결" },
  { key: "MANUAL", label: "수동 입력", status: "MANUAL_DATA", desc: "사용자가 직접 입력한 키워드만 저장" },
];
