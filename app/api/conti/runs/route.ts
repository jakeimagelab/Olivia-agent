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

function isMissingV2Column(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST204" || /schema cache|column .* does not exist/i.test(error.message ?? "");
}

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
  let { data, error } = await query.maybeSingle();
  // 신규 연결 컬럼이 아직 적용되지 않은 DB에서도 기존 hospital_id로 마지막 run을 찾는다.
  if (error && isMissingV2Column(error)) {
    if (!clientId) return NextResponse.json({ ok: true, run: null, legacySchema: true });
    const fallback = await db.from("conti_runs").select("*").eq("hospital_id", clientId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) return NextResponse.json({ ok: false, error: "콘티를 불러오지 못했습니다." }, { status: 500 });
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

  const baseRunFields = {
    hospital_id: hospitalId ?? null,
    specialty,
    doctor_count: input.doctorCount,
    staff_flags: input.staffFlags,
    harmony: input.harmony,
    checked: input.checked,
  };
  const fullRunFields = {
    ...baseRunFields,
    legacy_save_id: resourceId ?? null,
    workflow_run_id: workflowRunId ?? null,
    other_staff_role: input.otherStaffRole,
    custom_items: input.extraItems,
  };

  let runResult = await db.from("conti_runs").insert(fullRunFields).select("*").single();
  // 운영 DB 마이그레이션이 늦어져도 핵심 콘티 생성은 중단하지 않는다.
  if (runResult.error && isMissingV2Column(runResult.error)) {
    runResult = await db.from("conti_runs").insert(baseRunFields).select("*").single();
  }
  const { data: run, error: runError } = runResult;
  if (runError || !run) {
    return NextResponse.json({ ok: false, error: "콘티 저장 공간을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
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

  let scenesResult = await db.from("conti_scenes").insert(sceneRows).select("*");
  if (scenesResult.error && isMissingV2Column(scenesResult.error)) {
    const legacySceneRows = sceneRows.map(({ preparation_text, ...scene }) => {
      void preparation_text;
      return scene;
    });
    scenesResult = await db.from("conti_scenes").insert(legacySceneRows).select("*");
  }
  const { data: insertedScenes, error: scenesError } = scenesResult;
  if (scenesError) {
    await db.from("conti_runs").delete().eq("id", run.id);
    return NextResponse.json({ ok: false, error: "콘티 장면을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    run,
    groups: insertedGroups,
    scenes: insertedScenes,
    spaceMatchStats: result.spaceMatchStats,
  });
}
