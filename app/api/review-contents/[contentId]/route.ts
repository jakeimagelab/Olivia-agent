import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signReviewAsset, signReviewDocumentAssets } from "@/lib/reviewContent/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ contentId: string }> }) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { contentId } = await context.params;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("review_contents")
    .select("*, client_reviews(*, clients(*)), review_content_variants(*, review_layout_assets(*))")
    .eq("id", contentId)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ ok: false, error: "콘텐츠를 찾지 못했습니다." }, { status: 404 });
  const variants = await Promise.all((data.review_content_variants ?? []).map(async (variant: any) => ({
    ...variant,
    imageUrl: await signReviewAsset(db, variant.image_storage_path),
    assetUrls: await signReviewDocumentAssets(db, variant.generation_metadata),
  })));
  return NextResponse.json({ ok: true, content: { ...data, review_content_variants: variants } });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ contentId: string }> }) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { contentId } = await context.params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if ("caption" in body) patch.caption = String(body.caption || "").slice(0, 2_200);
  if ("hashtags" in body) patch.hashtags = String(body.hashtags || "").slice(0, 1_000);
  if ("summary" in body) patch.summary = String(body.summary || "").slice(0, 4_000);
  if ("carousel" in body && Array.isArray(body.carousel)) patch.carousel = body.carousel.slice(0, 10);
  if (!Object.keys(patch).length) return NextResponse.json({ ok: false, error: "수정할 내용이 없습니다." }, { status: 400 });
  const { data, error } = await getSupabaseAdmin().from("review_contents").update(patch).eq("id", contentId).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, content: data });
}
