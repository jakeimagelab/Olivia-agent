import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { renderReviewVariant, type ReviewLayoutConfig } from "@/lib/reviewContent/renderVariant";
import { REVIEW_CONTENT_BUCKET, signReviewAsset } from "@/lib/reviewContent/storage";
import { createReviewStoryDocument, splitReviewForPages, type ReviewStoryTemplateConfig } from "@/lib/reviewContent/storyDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest, context: { params: Promise<{ contentId: string }> }) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { contentId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  const { data: content, error: contentError } = await db
    .from("review_contents")
    .select("*, client_reviews(*, clients(*))")
    .eq("id", contentId)
    .maybeSingle();
  if (contentError || !content) return NextResponse.json({ ok: false, error: "콘텐츠를 찾지 못했습니다." }, { status: 404 });

  const requestedCount = Math.min(10, Math.max(1, Number(body.count) || 3));
  let layoutsQuery = db.from("review_layout_assets").select("*").eq("is_active", true).eq("ratio", "4:5");
  if (Array.isArray(body.layoutAssetIds) && body.layoutAssetIds.length) {
    layoutsQuery = layoutsQuery.in("id", body.layoutAssetIds.slice(0, 10));
  }
  const { data: layouts, error: layoutError } = await layoutsQuery.order("asset_type").limit(10);
  if (layoutError || !layouts?.length) {
    return NextResponse.json({ ok: false, error: layoutError?.message || "사용 가능한 레이아웃이 없습니다." }, { status: 400 });
  }

  const review = content.client_reviews || {};
  const client = review.clients || {};
  const hospitalName = client.hospital_name || client.name || "고객";
  const reviewText = review.public_review_text || review.good_points || content.summary;
  const pageCopy = splitReviewForPages(
    Array.isArray(content.carousel) && content.carousel.length
      ? content.carousel.map((item: any) => [item?.title, item?.body].filter(Boolean).join("\n")).join("\n\n")
      : reviewText,
    requestedCount,
  );
  const variants = [];
  for (let index = 0; index < requestedCount; index += 1) {
    const layout = layouts[index % layouts.length];
    const id = randomUUID();
    const storagePath = `variants/${id}/review-${contentId}.png`;
    const buffer = await renderReviewVariant({
      reviewText,
      hospitalName,
      writerName: review.writer_name,
      config: layout.layout_config as ReviewLayoutConfig,
    });
    const { error: uploadError } = await db.storage.from(REVIEW_CONTENT_BUCKET).upload(storagePath, buffer, {
      contentType: "image/png",
      upsert: false,
    });
    if (uploadError) return NextResponse.json({ ok: false, error: uploadError.message }, { status: 500 });
    const { data: variant, error: variantError } = await db.from("review_content_variants").insert({
      id,
      review_content_id: contentId,
      layout_asset_id: layout.id,
      image_storage_path: storagePath,
      mime_type: "image/png",
      width: 1080,
      height: 1350,
      generation_metadata: {
        renderer: "svg-sharp",
        layoutName: layout.name,
        editorDocument: createReviewStoryDocument({
          reviewText: pageCopy[index] || reviewText,
          hospitalName,
          doctorName: review.writer_name || "",
          date: review.delivered_at || "",
        }, layout.layout_config as ReviewStoryTemplateConfig),
      },
      sort_order: index,
    }).select("*").single();
    if (variantError) return NextResponse.json({ ok: false, error: variantError.message }, { status: 500 });
    variants.push({ ...variant, imageUrl: await signReviewAsset(db, storagePath) });
  }
  await db.from("review_contents").update({ status: "variants_ready" }).eq("id", contentId);
  return NextResponse.json({ ok: true, variants });
}
