import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isReviewStoryDocument } from "@/lib/reviewContent/storyDocument";
import { validReviewAssetPath } from "@/lib/reviewContent/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ contentId: string; variantId: string }> };

export async function PATCH(req: NextRequest, context: Params) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { contentId, variantId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const db = getSupabaseAdmin();
  const { data: current } = await db.from("review_content_variants")
    .select("id,generation_metadata")
    .eq("id", variantId)
    .eq("review_content_id", contentId)
    .maybeSingle();
  if (!current) return NextResponse.json({ ok: false, error: "스토리 페이지를 찾지 못했습니다." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if ("editorDocument" in body) {
    if (!isReviewStoryDocument(body.editorDocument)) return NextResponse.json({ ok: false, error: "편집 문서 형식이 올바르지 않습니다." }, { status: 400 });
    patch.generation_metadata = { ...(current.generation_metadata || {}), editorDocument: body.editorDocument, editedAt: new Date().toISOString() };
  }
  if ("imageStoragePath" in body) {
    const imageStoragePath = String(body.imageStoragePath || "");
    if (!validReviewAssetPath(imageStoragePath) || !imageStoragePath.startsWith(`variants/${variantId}/`)) {
      return NextResponse.json({ ok: false, error: "이미지 저장 경로가 올바르지 않습니다." }, { status: 400 });
    }
    patch.image_storage_path = imageStoragePath;
    patch.mime_type = "image/png";
  }
  if (Number.isInteger(body.sortOrder)) patch.sort_order = Math.max(0, Number(body.sortOrder));
  if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "수정할 내용이 없습니다." }, { status: 400 });

  const { data, error } = await db.from("review_content_variants").update(patch).eq("id", variantId).eq("review_content_id", contentId).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, variant: data });
}

export async function DELETE(req: NextRequest, context: Params) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { contentId, variantId } = await context.params;
  const db = getSupabaseAdmin();
  const { data: content } = await db.from("review_contents").select("selected_variant_id").eq("id", contentId).maybeSingle();
  if (content?.selected_variant_id === variantId) return NextResponse.json({ ok: false, error: "승인된 대표 시안은 삭제할 수 없습니다." }, { status: 409 });
  const { error } = await db.from("review_content_variants").delete().eq("id", variantId).eq("review_content_id", contentId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
