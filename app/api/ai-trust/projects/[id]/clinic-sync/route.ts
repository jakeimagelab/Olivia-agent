import { NextResponse } from "next/server";
import { enqueueAiTrustJobs } from "@/lib/ai-trust/jobs";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Params) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: project, error } = await db.from("ai_trust_projects")
    .select("id,department,region_config:ai_trust_regions(name,region_type,center_lat,center_lng,radius_m,districts)").eq("id", id).single();
  if (error || !project) return NextResponse.json({ ok: false, error: error?.message || "프로젝트를 찾지 못했습니다." }, { status: 404 });
  const region = Array.isArray(project.region_config) ? project.region_config[0] : project.region_config;
  if (!region?.center_lat || !region?.center_lng) return NextResponse.json({ ok: false, error: "이 범위에는 병원 검색 중심 좌표가 없습니다." }, { status: 400 });
  const period = new Date().toISOString().slice(0, 10);
  const result = await enqueueAiTrustJobs(db, [{
    project_id: id, job_type: "clinic_sync", idempotency_key: `clinic_sync:${id}:${period}`,
    payload: {
      center_lat: region.center_lat,
      center_lng: region.center_lng,
      radius_m: region.radius_m || (region.region_type === "radius" ? 1000 : 20_000),
      region_type: region.region_type,
      districts: region.districts || [],
      keyword: project.department || "피부과",
    },
  }]);
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, queued: true });
}
