import type { UnifiedReview } from "./types";

// client_reviews.content_status는 이미 'unused'|'candidate'|'drafted'|'approved'|'published'|'excluded'
// CHECK 제약을 갖고 있다(supabase/migrations/20260724_review_instagram_pipeline.sql) — 새 상태
// 필드를 만들지 않고 이 값을 리뷰 관리 화면의 3단계 표시(미제작/제작중/제작완료)로만 매핑한다.
export type ReviewContentStage = "not_created" | "in_progress" | "completed";

const STAGE_BY_STATUS: Record<string, ReviewContentStage> = {
  unused: "not_created",
  candidate: "not_created",
  excluded: "not_created",
  drafted: "in_progress",
  approved: "completed",
  published: "completed",
};

export const REVIEW_CONTENT_STAGE_LABEL: Record<ReviewContentStage, string> = {
  not_created: "미제작",
  in_progress: "제작중",
  completed: "제작완료",
};

export const REVIEW_CONTENT_STAGE_COLOR: Record<ReviewContentStage, { text: string; bg: string }> = {
  not_created: { text: "#6B807C", bg: "#F0F3F2" },
  in_progress: { text: "#B4690E", bg: "#FFF3E0" },
  completed: { text: "#155855", bg: "#EAF4F2" },
};

export function getReviewContentStage(contentStatus: string | undefined | null): ReviewContentStage {
  return STAGE_BY_STATUS[contentStatus || "unused"] ?? "not_created";
}

export function getReviewContentStageMeta(review: Pick<UnifiedReview, "content_status">) {
  const stage = getReviewContentStage(review.content_status);
  return { stage, label: REVIEW_CONTENT_STAGE_LABEL[stage], ...REVIEW_CONTENT_STAGE_COLOR[stage] };
}
