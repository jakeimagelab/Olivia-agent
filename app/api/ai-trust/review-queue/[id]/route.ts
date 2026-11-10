import { NextRequest, NextResponse } from "next/server";
import { normalizeClinicName } from "@/lib/ai-trust/clinics";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const db = getSupabaseAdmin();
  const { data: review, error } = await db.from("ai_trust_review_queue").select("*").eq("id", id).eq("status", "PENDING").maybeSingle();
  if (error || !review) return NextResponse.json({ ok: false, error: error?.message || "검수 항목을 찾지 못했습니다." }, { status: 404 });

  if (action === "ignore") {
    await db.from("ai_trust_review_queue").update({ status: "IGNORED", reviewed_at: new Date().toISOString() }).eq("id", id);
    if (review.mention_id) await db.from("ai_trust_hospital_mentions").update({ match_status: "IGNORED", matched_clinic_id: null }).eq("id", review.mention_id);
    return NextResponse.json({ ok: true, status: "IGNORED" });
  }

  let clinicId = String(body.clinic_id || "");
  if (action === "create") {
    const canonicalName = String(body.canonical_name || review.raw_name || "").trim();
    const address = String(body.address || "주소 확인 필요").trim();
    if (!canonicalName) return NextResponse.json({ ok: false, error: "병원명이 필요합니다." }, { status: 400 });
    const { data: clinic, error: clinicError } = await db.from("ai_trust_clinics").insert({
      canonical_name: canonicalName,
      normalized_name: normalizeClinicName(canonicalName),
      address,
      source: "manual",
      source_id: null,
      source_payload: { review_queue_id: id },
    }).select("id").single();
    if (clinicError || !clinic) return NextResponse.json({ ok: false, error: clinicError?.message || "병원 등록 실패" }, { status: 500 });
    clinicId = clinic.id;
  }
  if (!clinicId || !["match", "create"].includes(action)) {
    return NextResponse.json({ ok: false, error: "검수 동작 또는 병원을 확인해 주세요." }, { status: 400 });
  }

  const normalizedAlias = normalizeClinicName(review.raw_name);
  await db.from("ai_trust_clinic_aliases").upsert({ clinic_id: clinicId, alias: review.raw_name, normalized_alias: normalizedAlias, source: "review" }, { onConflict: "clinic_id,normalized_alias" });
  await db.from("ai_trust_review_queue").update({
    proposed_clinic_id: clinicId,
    status: action === "create" ? "CREATED" : "MATCHED",
    reviewed_at: new Date().toISOString(),
  }).eq("id", id);
  if (review.mention_id) {
    await db.from("ai_trust_hospital_mentions").update({ matched_clinic_id: clinicId, match_status: "MATCHED", match_confidence: 1 }).eq("id", review.mention_id);
  }
  return NextResponse.json({ ok: true, status: action === "create" ? "CREATED" : "MATCHED", clinic_id: clinicId });
}
