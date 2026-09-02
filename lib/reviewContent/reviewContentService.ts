import type { SupabaseClient } from "@supabase/supabase-js";

// 리뷰 관리 목록의 [콘텐츠 만들기]와 Olivia Chat의 createOliviaReviewCampaign이 같은
// "review_id로 review_contents를 찾거나 없으면 만든다" 로직을 쓴다 — 여기 한 곳에만 둔다
// (코드 요청서 2026-09 "리뷰 관리 → 리뷰 콘텐츠 제작 작업실 통합" 20/21절).
export function reviewText(review: Record<string, any>): string {
  return String(review.public_review_text || review.good_points || "").trim();
}

export function draftCampaignCopy(hospitalName: string, text: string) {
  const excerpt = text.length > 170 ? `${text.slice(0, 167).trim()}…` : text;
  return {
    summary: excerpt ? `${hospitalName} 고객이 남긴 후기를 바탕으로 콘텐츠 초안을 준비했습니다.` : `${hospitalName} 리뷰 콘텐츠 초안입니다.`,
    caption: excerpt ? `촬영이 끝난 뒤 ${hospitalName}에서 전해주신 이야기입니다.\n\n"${excerpt}"` : "",
    hashtags: "#포토클리닉 #photoclinic #병원사진 #병원브랜딩 #납품후기 #병원촬영후기 #의료브랜딩",
    carousel: excerpt ? [{ title: "고객이 가장 먼저 전한 말", body: excerpt }] : [],
  };
}

export type FindOrCreateReviewContentResult = { contentId: string; created: boolean };

// review_id 하나에 review_contents가 여러 개 생기지 않도록, 이미 있으면 그걸 재사용하고
// (실패한 것 제외) 없을 때만 draft 상태로 새로 만든다. 이미지 시안(review_content_variants)은
// 여기서 생성하지 않는다 — 리뷰 관리 화면의 [콘텐츠 만들기]는 에디터로 넘어가는 것까지만
// 책임지고, 실제 스토리 생성은 에디터 안의 "스토리 자동 생성" 버튼이 담당한다(불필요한 이미지
// 렌더링/업로드를 목록 클릭만으로 미리 하지 않기 위함).
export async function findOrCreateReviewContent(
  db: SupabaseClient,
  reviewId: string,
): Promise<FindOrCreateReviewContentResult> {
  const { data: review, error: reviewError } = await db
    .from("client_reviews")
    .select("*, clients(*)")
    .eq("id", reviewId)
    .maybeSingle();
  if (reviewError) throw new Error(reviewError.message);
  if (!review) throw new Error("리뷰를 찾지 못했습니다.");

  const { data: existing, error: existingError } = await db
    .from("review_contents")
    .select("id")
    .eq("review_id", reviewId)
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return { contentId: existing.id as string, created: false };

  const client = review.clients || {};
  const hospitalName = client.hospital_name || client.name || "고객";
  const copy = draftCampaignCopy(hospitalName, reviewText(review));
  const { data, error } = await db
    .from("review_contents")
    .insert({
      review_id: review.id,
      client_id: review.client_id,
      workflow_run_id: review.workflow_run_id || null,
      status: "draft",
      ...copy,
      selection_reason: "리뷰 관리 목록에서 콘텐츠 제작을 시작했습니다.",
      risk_flags: [],
      created_by: "admin",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "리뷰 콘텐츠 초안을 만들지 못했습니다.");
  return { contentId: data.id as string, created: true };
}
