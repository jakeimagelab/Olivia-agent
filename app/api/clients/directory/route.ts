import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 메일링 등에서 쓰는 가벼운 고객 주소록 — /api/clients와 달리 워크플로우·태스크 조인 없이
// 고객 등록 시 바로 반영되는 이름/이메일/연락처만 반환한다.
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("clients")
    .select("id, hospital_name, contact_name, phone, email")
    .not("email", "is", null)
    .neq("email", "")
    .order("hospital_name", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, clients: data ?? [] });
}
