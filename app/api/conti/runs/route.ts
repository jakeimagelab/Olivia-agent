import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  generateContiDraft,
  type GenerateContiInput,
  type HospitalSpaceRow,
  type HospitalStaffRow,
  type SceneTemplateRow,
} from "@/lib/conti/generate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 새 결정론적 콘티 생성: checked 체크항목을 scene_templates에 매칭해 conti_runs/
// conti_groups/conti_scenes에 저장한다. 기존 app/api/conti/route.ts(자유생성 GPT
// 프롬프트)는 건드리지 않는다 — 이 라우트가 신규 시스템의 생성 진입점이다.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    hospitalId,
    specialties,
    doctorCount,
    staffFlags,
    harmony,
    checked,
  }: {
    hospitalId?: string | null;
    specialties?: string[];
    doctorCount?: number;
    staffFlags?: { siljang?: boolean; jikwon?: boolean };
    harmony?: boolean;
    checked?: Record<string, string[]>;
  } = body ?? {};

  if (!Array.isArray(specialties) || specialties.length === 0) {
    return NextResponse.json({ ok: false, error: "specialties는 최소 1개 이상이어야 합니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  const { data: templateRows, error: templatesError } = await db
    .from("scene_templates")
    .select("id, specialty, category, scene_key, default_name, default_keyword, default_description, default_minutes, space_type, default_roles, needs_patient, per_doctor")
    .in("specialty", Array.from(new Set([...specialties, "공통"])));
  if (templatesError) {
    return NextResponse.json({ ok: false, error: templatesError.message }, { status: 500 });
  }

  let hospitalSpaces: HospitalSpaceRow[] = [];
  let hospitalStaff: HospitalStaffRow[] = [];
  if (hospitalId) {
    const [{ data: spaceRows, error: spacesError }, { data: staffRows, error: staffError }] = await Promise.all([
      db.from("hospital_spaces").select("id, name, space_type, floor").eq("hospital_id", hospitalId),
      db.from("hospital_staff").select("id, name, role").eq("hospital_id", hospitalId),
    ]);
    if (spacesError) return NextResponse.json({ ok: false, error: spacesError.message }, { status: 500 });
    if (staffError) return NextResponse.json({ ok: false, error: staffError.message }, { status: 500 });
    hospitalSpaces = spaceRows ?? [];
    hospitalStaff = staffRows ?? [];
  }

  const input: GenerateContiInput = {
    specialties,
    doctorCount: doctorCount && doctorCount > 0 ? doctorCount : 1,
    staffFlags: staffFlags ?? {},
    harmony: Boolean(harmony),
    checked: checked ?? {},
  };

  const result = generateContiDraft(input, {
    templates: (templateRows ?? []) as SceneTemplateRow[],
    hospitalSpaces,
    hospitalStaff,
  });

  const { data: run, error: runError } = await db
    .from("conti_runs")
    .insert({
      hospital_id: hospitalId ?? null,
      specialty: specialties.join(","),
      doctor_count: input.doctorCount,
      staff_flags: input.staffFlags,
      harmony: input.harmony,
      checked: input.checked,
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
    note: s.note,
    template_id: s.templateId,
    field_sources: s.fieldSources,
  }));

  const { data: insertedScenes, error: scenesError } = await db
    .from("conti_scenes")
    .insert(sceneRows)
    .select("*");
  if (scenesError) {
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
