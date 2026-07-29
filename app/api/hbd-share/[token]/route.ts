import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 의도적으로 /api/hospital-brand-diagnosis 접두사 밖에 둔다 — 그 접두사는
// middleware.ts의 protectedApiPrefixes에 등록되어 관리자 세션을 요구하므로,
// 로그인하지 않은 외부 수신자가 보기 전용 링크를 열 수 있어야 하는 이 라우트와는 맞지 않는다.
// 보안은 세션이 아니라 32바이트 랜덤 토큰(추측 불가) + 해시 저장 + 만료/취소로 확보한다.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!token || token.length < 20 || token.length > 128) {
      return NextResponse.json({ ok: false, error: "유효하지 않은 공유 링크입니다." }, { status: 404 });
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const supabase = getSupabaseAdmin();
    const { data: share, error } = await supabase
      .from("hospital_brand_diagnosis_shares")
      .select("id, diagnosis_id, expires_at, revoked_at, access_count")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!share) return NextResponse.json({ ok: false, error: "유효하지 않은 공유 링크입니다." }, { status: 404 });
    if (share.revoked_at) return NextResponse.json({ ok: false, error: "취소된 공유 링크입니다." }, { status: 410 });
    if (new Date(share.expires_at) < new Date()) return NextResponse.json({ ok: false, error: "만료된 공유 링크입니다." }, { status: 410 });

    const { data: diagnosis, error: diagnosisError } = await supabase
      .from("hospital_brand_diagnoses")
      .select("hospital_name, specialty, report_json, deleted_at")
      .eq("id", share.diagnosis_id)
      .maybeSingle();
    if (diagnosisError) throw new Error(diagnosisError.message);
    if (!diagnosis || diagnosis.deleted_at || !diagnosis.report_json) {
      return NextResponse.json({ ok: false, error: "공유된 리포트를 찾을 수 없습니다." }, { status: 404 });
    }

    await supabase.from("hospital_brand_diagnosis_shares").update({
      last_accessed_at: new Date().toISOString(), access_count: (share.access_count ?? 0) + 1,
    }).eq("id", share.id);

    return NextResponse.json({ ok: true, report: diagnosis.report_json, hospitalName: diagnosis.hospital_name });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "공유 링크 조회 실패" }, { status: 500 });
  }
}
