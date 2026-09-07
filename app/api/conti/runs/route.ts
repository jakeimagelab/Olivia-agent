import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  generateContiDraft,
  type GenerateContiInput,
  type HospitalSpaceRow,
  type HospitalStaffRow,
  type SceneTemplateRow,
} from "@/lib/conti/generate";
import { buildCodeSceneTemplates, getDepartmentDefinition } from "@/lib/conti/departmentTaxonomy";
import { enrichContiScenes } from "@/lib/conti/aiEnrichment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const resourceId = params.get("resourceId");
  const workflowRunId = params.get("workflowRunId");
  const clientId = params.get("clientId");
  if (!resourceId && !workflowRunId && !clientId) return NextResponse.json({ ok: false, error: "조회 기준이 필요합니다." }, { status: 400 });

  const db = getSupabaseAdmin();
  let query = db.from("conti_runs").select("*").order("updated_at", { ascending: false }).limit(1);
  if (resourceId) query = query.or(`id.eq.${resourceId},legacy_save_id.eq.${resourceId}`);
  else if (workflowRunId) query = query.eq("workflow_run_id", workflowRunId);
  else if (clientId) query = query.eq("hospital_id", clientId);
  const { data, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, run: data ?? null });
}

// 새 결정론적 콘티 생성: checked를 고정 taxonomy에 매칭해 Scene 골격을 만들고,
// 선택적으로 AI가 같은 Scene id 집합 안에서 촬영 정보를 보강한 뒤 저장한다.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    hospitalId,
    specialty,
    doctorCount,
    staffFlags,
    harmony,
    checked,
    otherStaffRole,
    extraItems,
    workflowRunId,
    resourceId,
  }: {
    hospitalId?: string | null;
    specialty?: string;
    doctorCount?: number;
    staffFlags?: { siljang?: boolean; jikwon?: boolean; other?: boolean };
    otherStaffRole?: string;
    harmony?: boolean;
    checked?: Record<string, string[]>;
    extraItems?: string[];
    workflowRunId?: string;
    resourceId?: string;
  } = body ?? {};

  if (!specialty || !getDepartmentDefinition(specialty)) {
    return NextResponse.json({ ok: false, error: "지원하는 진료과를 선택해야 합니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Scene 골격은 고정 taxonomy만 사용한다. scene_templates는 향후 AI 참고 데이터일 뿐
  // 체크 목록이나 Scene 존재 여부를 바꾸지 못한다.
  const templates: SceneTemplateRow[] = buildCodeSceneTemplates(specialty);

  let hospitalSpaces: HospitalSpaceRow[] = [];
  let hospitalStaff: HospitalStaffRow[] = [];
  if (hospitalId) {
    const [{ data: spaceRows, error: spacesError }, { data: staffRows, error: staffError }] = await Promise.all([
      db.from("hospital_spaces").select("id, name, space_type, floor").eq("hospital_id", hospitalId),
      db.from("hospital_staff").select("id, name, role").eq("hospital_id", hospitalId),
    ]);
    hospitalSpaces = spacesError ? [] : spaceRows ?? [];
    hospitalStaff = staffError ? [] : staffRows ?? [];
  }

  const input: GenerateContiInput = {
    specialty,
    doctorCount: doctorCount && doctorCount > 0 ? doctorCount : 1,
    staffFlags: { siljang: Boolean(staffFlags?.siljang), jikwon: Boolean(staffFlags?.jikwon), other: Boolean(staffFlags?.other) },
    otherStaffRole: typeof otherStaffRole === "string" ? otherStaffRole : "",
    harmony: Boolean(harmony),
    checked: checked ?? {},
    extraItems: Array.isArray(extraItems) ? extraItems.filter((item): item is string => typeof item === "string") : [],
  };

  const skeleton = generateContiDraft(input, {
    templates,
    hospitalSpaces,
    hospitalStaff,
  });
  const result = { ...skeleton, scenes: await enrichContiScenes(skeleton.scenes) };

  const { data: run, error: runError } = await db
    .from("conti_runs")
    .insert({
      hospital_id: hospitalId ?? null,
      legacy_save_id: resourceId ?? null,
      workflow_run_id: workflowRunId ?? null,
      specialty,
      doctor_count: input.doctorCount,
      staff_flags: input.staffFlags,
      other_staff_role: input.otherStaffRole,
      harmony: input.harmony,
      checked: input.checked,
      custom_items: input.extraItems,
    })
    .select("*")
    .single();
  if (runError || !run) {
    return NextResponse.json({ ok: false, error: runError?.message ?? "run 생성 실패" }, { status: 500 });
  }

  const { data: insertedGroups, error: groupsError } = await db
    .from("conti_groups")
    .insert(result.groups.map((g) => ({ run_id: run.id, name: g.name, sort: g.sort })))
    .select("id, name, sort");
  if (groupsError) {
    await db.from("conti_runs").delete().eq("id", run.id);
    return NextResponse.json({ ok: false, error: groupsError.message }, { status: 500 });
  }

  const groupIdByName = new Map((insertedGroups ?? []).map((g) => [g.name, g.id]));

  const sceneRows = result.scenes.map((s) => ({
    run_id: run.id,
    group_id: groupIdByName.get(s.group) ?? null,
    sort: s.sort,
    name: s.name,
    space_text: s.spaceText,
    minutes: s.minutes,
    keyword: s.keyword,
    description: s.description,
    procedures: s.procedures,
    people_text: s.peopleText,
    patient_role_text: s.patientRoleText,
    preparation_text: s.preparationText,
    note: s.note,
    template_id: s.templateId?.startsWith("code:") ? null : s.templateId,
    field_sources: s.fieldSources,
  }));

  const { data: insertedScenes, error: scenesError } = await db
    .from("conti_scenes")
    .insert(sceneRows)
    .select("*");
  if (scenesError) {
    await db.from("conti_runs").delete().eq("id", run.id);
    return NextResponse.json({ ok: false, error: scenesError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    run,
    groups: insertedGroups,
    scenes: insertedScenes,
    spaceMatchStats: result.spaceMatchStats,
  });
}
