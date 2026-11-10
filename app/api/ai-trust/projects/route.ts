import { NextRequest, NextResponse } from "next/server";
import { AI_TRUST_DEMAND_SOURCES } from "@/lib/ai-trust/constants";
import { generateGeoRadarPrompts } from "@/lib/ai-trust/prompts";
import { getSupabaseAdmin } from "@/lib/supabase";
import { geoRadarSetupResponse, isGeoRadarSchemaMissing } from "@/lib/ai-trust/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function listFromText(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export async function GET() {
 try {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ai_trust_projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return NextResponse.json({ ok: true, projects: data ?? [] });
 } catch (error) {
   if (isGeoRadarSchemaMissing(error)) return NextResponse.json(geoRadarSetupResponse(error), { status: 503 });
   return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "프로젝트 조회 실패" }, { status: 500 });
 }
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const projectName = String(body.project_name || "").trim();
  const clientHospitalName = String(body.client_hospital_name || "").trim();
  const region = String(body.region || "").trim();
  const department = String(body.department || "").trim();

  if (!projectName || !clientHospitalName || !region || !department) {
    return NextResponse.json({ ok: false, error: "프로젝트명, 클라이언트 병원, 지역, 진료과는 필수입니다." }, { status: 400 });
  }

  const treatments = listFromText(body.treatments);
  const symptoms = listFromText(body.symptoms);
  const manualKeywords = listFromText(body.manual_keywords);
  let regionId = body.region_id || null;
  if (!regionId && Number.isFinite(Number(body.center_lat)) && Number.isFinite(Number(body.center_lng))) {
    const { data: customRegion, error: customRegionError } = await supabase.from("ai_trust_regions").insert({
      name: `${projectName} 직접 지정 ${new Date().toISOString()}`,
      region_type: "custom",
      center_lat: Number(body.center_lat),
      center_lng: Number(body.center_lng),
      radius_m: Math.min(3000, Math.max(500, Number(body.radius_m || 1000))),
      districts: [],
      region_terms: manualKeywords,
      is_preset: false,
    }).select("id").single();
    if (customRegionError || !customRegion) return NextResponse.json({ ok: false, error: customRegionError?.message || "직접 지정 범위를 저장하지 못했습니다." }, { status: 500 });
    regionId = customRegion.id;
  }

  const { data: project, error } = await supabase
    .from("ai_trust_projects")
    .insert({
      client_id: body.client_id || null,
      project_name: projectName,
      client_hospital_name: clientHospitalName,
      region,
      region_id: regionId,
      scope_label: body.scope_label || region,
      department,
      treatments,
      symptoms,
      target_age: body.target_age || null,
      target_gender: body.target_gender || null,
      target_countries: listFromText(body.target_countries),
      target_languages: listFromText(body.target_languages),
      competitor_hospitals: listFromText(body.competitor_hospitals),
      memo: body.memo || null,
    })
    .select("*")
    .single();

  if (error) {
    if (isGeoRadarSchemaMissing(error)) return NextResponse.json(geoRadarSetupResponse(error), { status: 503 });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await supabase.from("ai_trust_data_sources").insert(
    AI_TRUST_DEMAND_SOURCES.map((source) => ({
      project_id: project.id,
      source_key: source.key,
      source_name: source.label,
      status: source.status,
      message: source.desc,
    }))
  );

  const demandItems = manualKeywords.map((keyword) => ({
    project_id: project.id,
    keyword,
    source: "MANUAL",
    volume: null,
    data_type: "MANUAL_KEYWORD",
    raw_data: { input: keyword },
  }));

  if (demandItems.length) await supabase.from("ai_trust_demand_items").insert(demandItems);

  const prompts = generateGeoRadarPrompts({
    keywords: manualKeywords.length ? manualKeywords : [`${region} ${department}`, `${region} ${department} 추천`],
    treatments,
    symptoms,
    region,
    department,
    language: "ko",
  });

  const { data: promptRows, error: promptError } = await supabase
    .from("ai_trust_prompts")
    .insert(prompts.map((prompt) => ({ ...prompt, project_id: project.id })))
    .select("*");

  if (promptError) return NextResponse.json({ ok: false, error: promptError.message }, { status: 500 });

  return NextResponse.json({ ok: true, project, prompts: promptRows ?? [] });
}
