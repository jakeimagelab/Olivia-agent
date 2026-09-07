import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildCodeSceneTemplates } from "@/lib/conti/departmentTaxonomy";
import type { SceneTemplateRow } from "@/lib/conti/generate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 과거 호환용 템플릿 조회 API. 신규 제작 화면은 이 응답을 taxonomy나 Scene 골격으로 쓰지 않는다.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const specialtiesParam = searchParams.get("specialties") ?? "";
  const specialties = specialtiesParam.split(",").map((s) => s.trim()).filter(Boolean);

  const codeTemplates = buildCodeSceneTemplates(specialties[0] ?? "");
  let db: ReturnType<typeof getSupabaseAdmin>;
  try {
    db = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ ok: true, templates: codeTemplates, usingFallback: true });
  }
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
    return NextResponse.json({ ok: true, templates: codeTemplates, usingFallback: true });
  }

  return NextResponse.json({
    ok: true,
    templates: (data?.length ? data : codeTemplates) as SceneTemplateRow[],
    usingFallback: (data ?? []).length === 0,
  });
}
