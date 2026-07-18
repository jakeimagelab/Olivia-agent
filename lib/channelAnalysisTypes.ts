export const CHANNELS = [
  { key: "insta", label: "인스타그램", weight: 35 },
  { key: "web", label: "홈페이지", weight: 35 },
  { key: "naver", label: "네이버 플레이스", weight: 20 },
  { key: "blog", label: "블로그", weight: 10 },
] as const;

export type ChannelKey = (typeof CHANNELS)[number]["key"];
export type ChannelUrls = Record<ChannelKey, string>;
export type Finding = { type: "issue" | "good" | "tip"; text: string };
export type ChannelResult = { score: number; status: string; findings: Finding[]; detail?: Record<string, unknown> };
export type ChannelAnalysisResult = {
  overall_score: number;
  overall_summary: string;
  photo_opportunity: string;
  channels: Record<ChannelKey, ChannelResult>;
  analyzed_channels: ChannelKey[];
  coverage_summary: string;
  seo_insights: string[];
  instagram_metrics: { post_count: number; avg_likes: number | null; avg_comments: number | null; engagement_rate: number | null } | null;
  report_sections: Array<{ title: string; items: string[] }>;
  package_recommendation: { name: string; reason: string; items: string[] };
  collection_summary: Record<string, unknown>;
};
