import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 제작 화면의 "촬영 항목" 체크리스트가 이 목록을 그대로 대분류(category)별로 묶어서 그린다 —
// 별도 taxonomy 테이블 없이 scene_templates 자체가 체크리스트 데이터를 겸한다.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const specialtiesParam = searchParams.get("specialties") ?? "";
  const specialties = specialtiesParam.split(",").map((s) => s.trim()).filter(Boolean);

  const db = getSupabaseAdmin();
  let query = db
    .from("scene_templates")
    .select("id, specialty, category, scene_key, default_name, default_keyword, default_description, default_minutes, space_type, default_roles, needs_patient, per_doctor")
    .order("specialty")
    .order("category");

  if (specialties.length > 0) {
    query = query.in("specialty", Array.from(new Set([...specialties, "공통"])));
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, templates: data ?? [] });
}
