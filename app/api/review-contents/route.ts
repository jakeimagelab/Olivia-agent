import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { signReviewAsset, signReviewDocumentAssets } from "@/lib/reviewContent/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isAdminSession(req)) {
    return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  let query = db
    .from("review_contents")
    // review_contents.selected_variant_id도 review_content_variants를 가리키고 있어서(양방향
    // FK) review_content_variants(...)만 쓰면 PostgREST가 어느 FK로 임베드할지 못 정하고
    // "more than one relationship was found" 오류를 낸다 — review_content_id FK를 명시한다.
    .select("*, client_reviews(*, clients(*)), review_content_variants!review_content_id(*, review_layout_assets(*))")
    .order("created_at", { ascending: false })
    .limit(100);
  const status = req.nextUrl.searchParams.get("status");
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const contents = await Promise.all((data ?? []).map(async (content) => ({
    ...content,
    review_content_variants: await Promise.all((content.review_content_variants ?? []).map(async (variant: any) => ({
      ...variant,
      imageUrl: await signReviewAsset(db, variant.image_storage_path),
      assetUrls: await signReviewDocumentAssets(db, variant.generation_metadata),
    }))),
  })));
  return NextResponse.json({ ok: true, contents });
}
