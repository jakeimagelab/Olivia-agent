import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getSignedAssetUrl } from "@/lib/hospitalBrandDiagnosis/storage";
import { isUuid } from "@/lib/hospitalBrandDiagnosis/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 섹션 11-2: 근거 보기 패널에서 업로드 이미지 원본을 확인할 때, 진단 ID 소유 범위 안의
// 자산만 signed URL로 내려준다(만료 5분) — 원본 storage_path나 영구 공개 URL은 노출하지 않는다.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const diagnosisId = String(body.diagnosisId || "");
    if (!isUuid(diagnosisId)) return NextResponse.json({ ok: false, error: "diagnosisId가 올바르지 않습니다." }, { status: 400 });

    const assetIds = Array.isArray(body.assetIds) ? (body.assetIds as unknown[]).filter(isUuid).slice(0, 30) : [];
    if (assetIds.length === 0) return NextResponse.json({ ok: true, urls: {} });

    const supabase = getSupabaseAdmin();
    const { data: assets, error } = await supabase
      .from("hospital_brand_diagnosis_assets")
      .select("id, storage_path")
      .eq("diagnosis_id", diagnosisId)
      .in("id", assetIds);
    if (error) throw new Error(error.message);

    const urls: Record<string, string> = {};
    for (const asset of assets ?? []) {
      const signed = await getSignedAssetUrl(supabase, asset.storage_path);
      if (signed) urls[asset.id] = signed;
    }

    return NextResponse.json({ ok: true, urls });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "이미지 URL 조회 실패" }, { status: 500 });
  }
}
