import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isUuid } from "@/lib/hospitalBrandDiagnosis/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH — 공유 링크 취소(revoke). 1차 버전은 취소만 지원한다(수정/재발급 없음).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; shareId: string }> }) {
  try {
    const { id, shareId } = await params;
    if (!isUuid(id) || !isUuid(shareId)) {
      return NextResponse.json({ ok: false, error: "요청 값이 올바르지 않습니다." }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    if (body.action !== "revoke") {
      return NextResponse.json({ ok: false, error: "지원하지 않는 작업입니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: existing, error: findError } = await supabase
      .from("hospital_brand_diagnosis_shares").select("id, diagnosis_id").eq("id", shareId).maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!existing || existing.diagnosis_id !== id) {
      return NextResponse.json({ ok: false, error: "공유 링크를 찾을 수 없습니다." }, { status: 404 });
    }

    const { error } = await supabase
      .from("hospital_brand_diagnosis_shares").update({ revoked_at: new Date().toISOString() }).eq("id", shareId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "공유 링크 취소 실패" }, { status: 500 });
  }
}
