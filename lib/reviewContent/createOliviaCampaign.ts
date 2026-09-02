import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderReviewVariant, type ReviewLayoutConfig } from "@/lib/reviewContent/renderVariant";
import { REVIEW_CONTENT_BUCKET } from "@/lib/reviewContent/storage";
import { reviewText } from "@/lib/reviewContent/reviewContentService";

type CreateOliviaCampaignInput = {
  reviewId?: string;
  hospitalName?: string;
};

function hasRisk(review: Record<string, any>) {
  const text = `${reviewText(review)} ${review.improvement_points || ""}`;
  return Number(review.overall_rating || 0) < 4
    || Boolean(String(review.improvement_points || "").trim())
    || /(완치|보장|부작용\s*없|최고|유일|100%|무조건)/i.test(text)
    || /\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/.test(text);
}

// createOliviaReviewCampaign은 후보 선택 단계에서 이미 만족도 높은 후기를 골랐다는 걸 알고
// 있어서, 리뷰 관리 목록의 범용 초안(draftCampaignCopy)보다 조금 더 풍부한 카피를 쓴다 —
// findOrCreateReviewContent를 그대로 쓰지 않고 이 파일 안에서 직접 insert하는 이유.
function campaignCopy(hospitalName: string, text: string) {
  const excerpt = text.length > 170 ? `${text.slice(0, 167).trim()}…` : text;
  return {
    summary: `${hospitalName} 고객이 남긴 구체적인 촬영 후기를 바탕으로 올리비아가 콘텐츠 후보를 선택했습니다.`,
    caption: `촬영이 끝난 뒤 ${hospitalName}에서 전해주신 이야기입니다.\n\n“${excerpt}”\n\n사진은 공간을 예쁘게 기록하는 데서 끝나지 않습니다.\n병원이 환자를 맞이하는 태도와 분위기까지 선명하게 전하는 일이라고 믿습니다.`,
    hashtags: "#포토클리닉 #photoclinic #병원사진 #병원브랜딩 #납품후기 #병원촬영후기 #의료브랜딩",
    carousel: [
      { title: "고객이 가장 먼저 전한 말", body: excerpt },
      { title: "사진에 담긴 병원다움", body: "공간과 의료진이 가진 신뢰와 분위기를 자연스럽게 기록했습니다." },
      { title: "촬영 이후의 변화", body: "홈페이지와 콘텐츠에서 병원의 첫인상을 더 일관되게 전달합니다." },
    ],
  };
}

export async function createOliviaReviewCampaign(
  db: SupabaseClient,
  input: CreateOliviaCampaignInput,
) {
  const { data: reviews, error: reviewError } = await db
    .from("client_reviews")
    .select("*, clients(*)")
    .eq("allow_public_use", true)
    .in("content_status", ["unused", "candidate", "drafted"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (reviewError) throw new Error(reviewError.message);

  const hospitalKeyword = String(input.hospitalName || "").trim().toLowerCase();
  const candidates = (reviews || [])
    .filter((review) => !input.reviewId || review.id === input.reviewId)
    .filter((review) => {
      if (!hospitalKeyword) return true;
      const client = review.clients || {};
      return `${client.hospital_name || ""} ${client.name || ""}`.toLowerCase().includes(hospitalKeyword);
    })
    .filter((review) => reviewText(review).length >= 20 && !hasRisk(review))
    .sort((a, b) => {
      const rating = Number(b.overall_rating || 0) - Number(a.overall_rating || 0);
      return rating || reviewText(b).length - reviewText(a).length;
    });

  const review = candidates[0];
  if (!review) {
    throw new Error("공개 동의가 있고 콘텐츠 안전 기준을 통과한 리뷰를 찾지 못했습니다.");
  }

  const client = review.clients || {};
  const hospitalName = client.hospital_name || client.name || "고객";
  const copy = campaignCopy(hospitalName, reviewText(review));
  const { data: existing } = await db
    .from("review_contents")
    // review_contents.selected_variant_id도 review_content_variants를 가리키는 양방향 FK라서
    // review_content_id FK를 명시하지 않으면 PostgREST의 "more than one relationship" 오류가 난다.
    .select("*, review_content_variants!review_content_id(id)")
    .eq("review_id", review.id)
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let content = existing;
  if (!content) {
    const { data, error } = await db.from("review_contents").insert({
      review_id: review.id,
      client_id: review.client_id,
      workflow_run_id: review.workflow_run_id || null,
      status: "draft",
      ...copy,
      selection_reason: "공개 동의, 높은 만족도, 구체적인 후기 내용을 기준으로 올리비아가 선택했습니다.",
      risk_flags: [],
      created_by: "olivia_chat",
    }).select("*").single();
    if (error || !data) throw new Error(error?.message || "리뷰 콘텐츠 초안을 만들지 못했습니다.");
    content = data;
  }

  if (!(content.review_content_variants || []).length) {
    const { data: layouts, error: layoutError } = await db
      .from("review_layout_assets")
      .select("*")
      .eq("is_active", true)
      .eq("ratio", "4:5")
      .order("asset_type")
      .limit(3);
    if (layoutError || !layouts?.length) throw new Error(layoutError?.message || "사용 가능한 레이아웃이 없습니다.");

    for (let index = 0; index < layouts.length; index += 1) {
      const layout = layouts[index];
      const variantId = randomUUID();
      const storagePath = `variants/${variantId}/review-${content.id}.png`;
      const image = await renderReviewVariant({
        reviewText: reviewText(review),
        hospitalName,
        writerName: review.writer_name,
        config: layout.layout_config as ReviewLayoutConfig,
      });
      const { error: uploadError } = await db.storage
        .from(REVIEW_CONTENT_BUCKET)
        .upload(storagePath, image, { contentType: "image/png", upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const { error: variantError } = await db.from("review_content_variants").insert({
        id: variantId,
        review_content_id: content.id,
        layout_asset_id: layout.id,
        image_storage_path: storagePath,
        mime_type: "image/png",
        width: 1080,
        height: 1350,
        generation_metadata: { renderer: "svg-sharp", source: "olivia_chat", layoutName: layout.name },
        sort_order: index,
      });
      if (variantError) throw new Error(variantError.message);
    }
    await db.from("review_contents").update({ status: "variants_ready" }).eq("id", content.id);
  }

  await Promise.all([
    db.from("client_reviews").update({ content_status: "drafted" }).eq("id", review.id),
    db.from("agent_logs").insert({
      client_id: review.client_id,
      workflow_run_id: review.workflow_run_id || null,
      log_type: "review_content_created",
      message: `[리뷰 콘텐츠] 올리비아가 ${hospitalName} 리뷰를 선택해 이미지 시안 3개를 준비했습니다.`,
      success: true,
    }),
  ]);

  return {
    contentId: content.id as string,
    reviewId: review.id as string,
    hospitalName,
    action: "navigate",
    url: "/review-studio",
    message: `${hospitalName} 리뷰를 선택해 Instagram 이미지 시안 3개를 만들었어요. 리뷰 콘텐츠 화면에서 시안을 선택하고 대표 승인할 수 있습니다.`,
    dataChanged: ["reviews", "review_contents"],
  };
}
