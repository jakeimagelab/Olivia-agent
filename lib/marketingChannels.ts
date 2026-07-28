// 마케팅 전략/지표에서 자주 쓰는 채널·지표 프리셋.
// DB에는 자유 텍스트로 저장되며, 이 목록은 프론트 콤보박스의 추천값일 뿐 — 여기 없는 값도 그대로 저장/조회된다.

export const CHANNEL_PRESETS: { value: string; label: string }[] = [
  { value: "instagram", label: "인스타그램" },
  { value: "homepage", label: "홈페이지" },
  { value: "youtube", label: "유튜브" },
  { value: "naver_blog", label: "네이버 블로그" },
  { value: "naver_place", label: "네이버 플레이스" },
  { value: "offline_event", label: "오프라인 이벤트" },
  { value: "seminar", label: "학회/컨퍼런스" },
];

export function channelLabel(channel: string): string {
  return CHANNEL_PRESETS.find((c) => c.value === channel)?.label || channel || "미분류";
}

export const METRIC_PRESETS_BY_CHANNEL: Record<string, string[]> = {
  instagram: ["likes", "saves", "reach", "profile_visits", "comments"],
  homepage: ["visitors", "inquiries", "bounce_rate"],
  youtube: ["views", "watch_time", "subscribers"],
  naver_blog: ["visitors", "inquiries"],
  naver_place: ["visitors", "inquiries", "reviews"],
  offline_event: ["attendees", "leads"],
  seminar: ["attendees", "leads"],
};

export const METRIC_LABELS: Record<string, string> = {
  likes: "좋아요",
  saves: "저장",
  reach: "도달",
  profile_visits: "프로필 방문",
  comments: "댓글",
  visitors: "방문자",
  inquiries: "문의",
  bounce_rate: "이탈률",
  views: "조회수",
  watch_time: "시청시간(분)",
  subscribers: "구독자",
  reviews: "리뷰",
  attendees: "참석자",
  leads: "리드",
};

export function metricLabel(metricType: string): string {
  return METRIC_LABELS[metricType] || metricType;
}

export function metricPresetsForChannel(channel: string): string[] {
  return METRIC_PRESETS_BY_CHANNEL[channel] ?? [];
}
