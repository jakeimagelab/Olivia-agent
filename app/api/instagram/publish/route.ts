import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getInstagramCredentials, publishInstagramImage } from "@/lib/instagram/client";
import { signReviewAsset } from "@/lib/reviewContent/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "대표자 로그인이 필요합니다." }, { status: 401 });
  const { contentId } = await req.json();
  const db = getSupabaseAdmin();
  const { data: content } = await db.from("review_contents")
    .select("*")
    .eq("id", contentId)
    .maybeSingle();
  if (!content || content.status !== "approved" || !content.selected_variant_id) {
    return NextResponse.json({ ok: false, error: "대표 승인된 시안만 게시할 수 있습니다." }, { status: 409 });
  }
  const { data: variant } = await db.from("review_content_variants").select("*").eq("id", content.selected_variant_id).maybeSingle();
  if (!variant) return NextResponse.json({ ok: false, error: "승인된 이미지 시안을 찾지 못했습니다." }, { status: 404 });
  const credentials = await getInstagramCredentials(db);
  if (!credentials?.accountId) return NextResponse.json({ ok: false, error: "포토클리닉 Instagram 계정을 먼저 연결해주세요." }, { status: 409 });

  const idempotencyKey = createHash("sha256").update(`instagram:${content.id}:${variant.id}`).digest("hex");
  const { data: existing } = await db.from("instagram_publish_jobs").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing?.status === "published") return NextResponse.json({ ok: true, alreadyPublished: true, mediaId: existing.meta_media_id });
  if (existing?.status === "publishing") return NextResponse.json({ ok: false, error: "이미 게시를 진행 중입니다." }, { status: 409 });

  const { data: job, error: jobError } = existing
    ? await db.from("instagram_publish_jobs").update({
        status: "publishing",
        error_message: null,
        retry_count: Number(existing.retry_count || 0) + 1,
        approved_by: "owner",
        approved_at: content.approved_at || new Date().toISOString(),
      }).eq("id", existing.id).select("*").single()
    : await db.from("instagram_publish_jobs").insert({
        review_content_id: content.id,
        variant_id: variant.id,
        account_id: credentials.accountId,
        status: "publishing",
        caption: `${content.caption}\n\n${content.hashtags}`.trim(),
        idempotency_key: idempotencyKey,
        approved_by: "owner",
        approved_at: content.approved_at || new Date().toISOString(),
      }).select("*").single();
  if (jobError || !job) return NextResponse.json({ ok: false, error: jobError?.message || "게시 작업 생성 실패" }, { status: 500 });

  try {
    const imageUrl = await signReviewAsset(db, variant.image_storage_path, 60 * 15);
    if (!imageUrl) throw new Error("게시 이미지 URL을 만들지 못했습니다.");
    const published = await publishInstagramImage({
      credentials,
      imageUrl,
      caption: job.caption,
    });
    const now = new Date().toISOString();
    await Promise.all([
      db.from("instagram_publish_jobs").update({
        status: "published",
        meta_creation_id: published.creationId,
        meta_media_id: published.mediaId,
        published_at: now,
      }).eq("id", job.id),
      db.from("review_contents").update({ status: "published", published_at: now }).eq("id", content.id),
      db.from("client_reviews").update({ content_status: "published" }).eq("id", content.review_id),
    ]);
    return NextResponse.json({ ok: true, mediaId: published.mediaId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instagram 게시 실패";
    await db.from("instagram_publish_jobs").update({ status: "failed", error_message: message.slice(0, 1_000) }).eq("id", job.id);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
