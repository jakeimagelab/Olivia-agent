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
    .select("*, client_reviews(*, clients(*)), review_content_variants(*, review_layout_assets(*))")
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
