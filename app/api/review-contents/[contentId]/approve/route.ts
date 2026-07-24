import { NextRequest, NextResponse } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ contentId: string }> }) {
  if (!isAdminSession(req)) return NextResponse.json({ ok: false, error: "대표자 로그인이 필요합니다." }, { status: 401 });
  const { contentId } = await context.params;
  const { variantId } = await req.json();
  const db = getSupabaseAdmin();
  const { data: content } = await db.from("review_contents").select("id,review_id,status").eq("id", contentId).maybeSingle();
  if (!content || !["variants_ready", "waiting_approval"].includes(content.status)) {
    return NextResponse.json({ ok: false, error: "승인 가능한 상태가 아닙니다." }, { status: 409 });
  }
  const { data: variant } = await db.from("review_content_variants").select("id,layout_asset_id").eq("id", variantId).eq("review_content_id", contentId).maybeSingle();
  if (!variant) return NextResponse.json({ ok: false, error: "선택한 시안을 찾지 못했습니다." }, { status: 404 });
  const now = new Date().toISOString();
  const { error } = await db.from("review_contents").update({
    status: "approved",
    selected_variant_id: variant.id,
    selected_layout_asset_id: variant.layout_asset_id,
    approved_by: "owner",
    approved_at: now,
  }).eq("id", contentId).eq("status", content.status);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await Promise.all([
    db.from("review_content_variants").update({ is_selected: false }).eq("review_content_id", contentId),
    db.from("review_content_variants").update({ is_selected: true }).eq("id", variant.id),
    db.from("client_reviews").update({ content_status: "approved" }).eq("id", content.review_id),
  ]);
  return NextResponse.json({ ok: true });
}
