import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeClientReview } from "@/lib/reviews/normalizeReview";
import { getErrorMessage } from "@/lib/errors";
import { moveRecordToTrash } from "@/lib/trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, context: { params: Promise<{ reviewId: string }> }) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { reviewId } = await context.params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("reviewText" in body) {
    const reviewText = String(body.reviewText || "").trim().slice(0, 10_000);
    if (!reviewText) return NextResponse.json({ ok: false, error: "후기 내용은 비울 수 없습니다." }, { status: 400 });
    patch.public_review_text = reviewText;
    patch.good_points = reviewText;
  }
  if ("reviewerName" in body) patch.writer_name = String(body.reviewerName || "").trim().slice(0, 120);
  if ("deliveredAt" in body) patch.delivered_at = body.deliveredAt || null;
  if ("permissionToPublish" in body) patch.allow_public_use = Boolean(body.permissionToPublish);
  if (Object.keys(patch).length === 1) return NextResponse.json({ ok: false, error: "수정할 후기 정보가 없습니다." }, { status: 400 });
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("client_reviews").update(patch).eq("id", reviewId).select("*, clients(*)").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, review: normalizeClientReview(data as Record<string, any>) });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ reviewId: string }> }) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { reviewId } = await context.params;
  const db = getSupabaseAdmin();
  try {
    // client_reviews → review_contents는 on delete cascade라서, 콘텐츠가 이미 만들어진 리뷰를
    // 그냥 지우면 review_contents/review_content_variants까지 복구 불가능하게 같이 사라진다.
    // 휴지통은 client_reviews 행만 백업하므로, 콘텐츠가 있으면 먼저 지우게 안내한다.
    const { data: existingContent, error: contentCheckError } = await db
      .from("review_contents")
      .select("id")
      .eq("review_id", reviewId)
      .limit(1)
      .maybeSingle();
    if (contentCheckError) throw contentCheckError;
    if (existingContent) {
      return NextResponse.json({ ok: false, error: "이미 만들어진 콘텐츠가 있는 리뷰입니다. 콘텐츠를 먼저 삭제해 주세요." }, { status: 409 });
    }
    await moveRecordToTrash(db, "client_review", reviewId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
