import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 병원 선택 시 공간/의료진을 함께 불러와 제작 화면의 실시간 매칭 미리보기에 쓴다.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hospitalId = searchParams.get("hospitalId");
  if (!hospitalId) {
    return NextResponse.json({ ok: true, spaces: [], staff: [] });
  }

  const db = getSupabaseAdmin();
  const [{ data: spaces, error: spacesError }, { data: staff, error: staffError }] = await Promise.all([
    db.from("hospital_spaces").select("id, name, space_type, floor").eq("hospital_id", hospitalId).order("sort"),
    db.from("hospital_staff").select("id, name, role").eq("hospital_id", hospitalId).order("sort"),
  ]);
  if (spacesError) return NextResponse.json({ ok: false, error: spacesError.message }, { status: 500 });
  if (staffError) return NextResponse.json({ ok: false, error: staffError.message }, { status: 500 });

  return NextResponse.json({ ok: true, spaces: spaces ?? [], staff: staff ?? [] });
}
