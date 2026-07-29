import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { HospitalBrandProfile } from "@/lib/hospitalBrandDiagnosis/types";
import { HBD_ALGORITHM_VERSION } from "@/lib/hospitalBrandDiagnosis/config";
import { escapeList, escapeText, isUuid } from "@/lib/hospitalBrandDiagnosis/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// STEP1(병원 기본정보)+STEP2(브랜드 목표) 저장 후 진단 세션을 생성한다.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const hospitalName = escapeText(body.hospitalName, 120);
    if (!hospitalName) return NextResponse.json({ ok: false, error: "병원명을 입력해주세요." }, { status: 400 });
    const specialty = escapeText(body.specialty, 120);
    if (!specialty) return NextResponse.json({ ok: false, error: "진료과를 입력해주세요." }, { status: 400 });

    const profile: HospitalBrandProfile = {
      hospitalName,
      specialty,
      region: escapeText(body.region, 120) || undefined,
      primaryTreatments: escapeList(body.primaryTreatments),
      targetPatients: escapeList(body.targetPatients) || undefined,
      desiredImages: escapeList(body.desiredImages),
      coreStrengths: escapeList(body.coreStrengths),
      currentConcerns: escapeList(body.currentConcerns),
    };

    const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("hospital_brand_diagnoses")
      .insert({
        client_id: clientId,
        hospital_name: profile.hospitalName,
        specialty: profile.specialty,
        region: profile.region ?? "",
        profile_json: profile,
        status: "draft",
        algorithm_version: HBD_ALGORITHM_VERSION,
      })
      .select("id, status, created_at")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, id: data.id, status: data.status, createdAt: data.created_at });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "진단 세션 생성 실패" }, { status: 500 });
  }
}

// 진단 이력 목록 (섹션 33: 병원명/채널/단계/상태/생성일/수정일 표시)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20") || 20));

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("hospital_brand_diagnoses")
      .select("id, hospital_name, specialty, status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, diagnoses: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "진단 이력 조회 실패" }, { status: 500 });
  }
}
