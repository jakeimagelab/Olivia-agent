import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const db = getSupabaseAdmin();
  const [{ data: reviews, error }, { data: clinics, error: clinicsError }] = await Promise.all([
    db.from("ai_trust_review_queue")
      .select("id,project_id,response_id,mention_id,raw_name,proposed_clinic_id,confidence,created_at,project:ai_trust_projects(project_name,client_hospital_name)")
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("ai_trust_clinics")
      .select("id,canonical_name,address")
      .order("canonical_name", { ascending: true })
      .limit(1000),
  ]);
  if (error || clinicsError) {
    return NextResponse.json({ ok: false, error: error?.message || clinicsError?.message || "검수 대기함을 불러오지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reviews: reviews || [], clinics: clinics || [] });
}
