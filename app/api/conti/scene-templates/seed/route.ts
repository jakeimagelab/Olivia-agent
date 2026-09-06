import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildAllSeedRows, type CaseSceneInput } from "@/lib/conti/sceneTemplateSeed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 1회성 관리자 작업: scene_templates를 기존 SPEC_DEFAULTS(진료과 16개 하드코딩 지식) +
// conti_case_scenes(분석 완료된 과거 콘티 사례)로부터 자동 시딩한다. 몇 번을 실행해도
// (specialty, scene_key) upsert라 안전하다 — 사례 라이브러리가 늘어나면 다시 호출해
// "사례 기반 장면" 카테고리를 갱신하면 된다.
export async function POST() {
  const db = getSupabaseAdmin();

  const { data: analyzedDocs, error: docsError } = await db
    .from("conti_case_documents")
    .select("id")
    .eq("status", "analyzed");
  if (docsError) {
    return NextResponse.json({ ok: false, error: docsError.message }, { status: 500 });
  }

  const docIds = (analyzedDocs ?? []).map((d) => d.id);
  let caseScenes: CaseSceneInput[] = [];

  if (docIds.length > 0) {
    const { data: sceneRows, error: scenesError } = await db
      .from("conti_case_scenes")
      .select("department, scene_name, location, action, camera_angle, direction, notes, subjects")
      .in("case_document_id", docIds);
    if (scenesError) {
      return NextResponse.json({ ok: false, error: scenesError.message }, { status: 500 });
    }
    caseScenes = (sceneRows ?? []).map((row) => ({
      department: row.department,
      sceneName: row.scene_name,
      location: row.location,
      action: row.action,
      cameraAngle: row.camera_angle,
      direction: row.direction,
      notes: row.notes,
      subjects: Array.isArray(row.subjects) ? (row.subjects as string[]) : [],
    }));
  }

  const rows = buildAllSeedRows(caseScenes);

  const { error: upsertError } = await db
    .from("scene_templates")
    .upsert(rows, { onConflict: "specialty,scene_key" });
  if (upsertError) {
    return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 });
  }

  const byCategory: Record<string, number> = {};
  for (const row of rows) byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;

  return NextResponse.json({
    ok: true,
    seeded: rows.length,
    byCategory,
    caseScenesUsed: caseScenes.length,
  });
}
