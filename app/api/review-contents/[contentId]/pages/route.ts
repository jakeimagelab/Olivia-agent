import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isReviewStoryDocument, type ReviewStoryPageType } from "@/lib/reviewContent/storyDocument";
import { pendingReviewVariantPath } from "@/lib/reviewContent/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_TYPES: ReviewStoryPageType[] = ["review", "cover", "free"];

export async function POST(req: NextRequest, context: { params: Promise<{ contentId: string }> }) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const { contentId } = await context.params;
  const body = await req.json().catch(() => ({}));
  if (!isReviewStoryDocument(body.editorDocument)) {
    return NextResponse.json({ ok: false, error: "페이지 문서 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const pageType = PAGE_TYPES.includes(body.pageType) ? body.pageType : "free";
  const pageName = String(body.pageName || (pageType === "cover" ? "커버 페이지" : pageType === "review" ? "리뷰 페이지" : "자유 페이지")).trim().slice(0, 80);
  const db = getSupabaseAdmin();
  const { data: content } = await db.from("review_contents").select("id").eq("id", contentId).maybeSingle();
  if (!content) return NextResponse.json({ ok: false, error: "콘텐츠를 찾지 못했습니다." }, { status: 404 });

  const { data: lastPage } = await db.from("review_content_variants")
    .select("sort_order")
    .eq("review_content_id", contentId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = randomUUID();
  const { data, error } = await db.from("review_content_variants").insert({
    id,
    review_content_id: contentId,
    layout_asset_id: typeof body.layoutAssetId === "string" ? body.layoutAssetId : null,
    image_storage_path: pendingReviewVariantPath(id),
    mime_type: "image/png",
    width: body.editorDocument.width,
    height: body.editorDocument.height,
    sort_order: (lastPage?.sort_order ?? -1) + 1,
    generation_metadata: {
      renderer: "review-canvas-renderer",
      pageType,
      pageName,
      designPreset: typeof body.designPreset === "string" ? body.designPreset : null,
      editorDocument: body.editorDocument,
    },
  }).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, page: { ...data, imageUrl: null, assetUrls: {} } });
}
