import { getSupabaseAdmin } from "@/lib/supabase";
import { generateContiDraft, type GenerateContiInput, type HospitalSpaceRow, type HospitalStaffRow, type SceneTemplateRow } from "@/lib/conti/generate";
import { buildCodeSceneTemplates, getDepartmentDefinition } from "@/lib/conti/departmentTaxonomy";
import { enrichContiScenes } from "@/lib/conti/aiEnrichment";

export type CanonicalContiPayload = {
  ok: true;
  run: Record<string, unknown>;
  groups: Array<Record<string, unknown>>;
  scenes: Array<Record<string, unknown>>;
  spaceMatchStats?: unknown;
};

export type CreateCanonicalContiInput = {
  hospitalId?: string | null;
  specialty: string;
  doctorCount?: number;
  staffFlags?: { siljang?: boolean; jikwon?: boolean; other?: boolean };
  otherStaffRole?: string;
  harmony?: boolean;
  checked?: Record<string, string[]>;
  extraItems?: string[];
  workflowRunId?: string | null;
  resourceId?: string | null;
};

function isMissingV2Column(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "PGRST204" || /schema cache|column .* does not exist/i.test(error.message ?? "")));
}

export async function getCanonicalConti(runId: string): Promise<CanonicalContiPayload> {
  const db = getSupabaseAdmin();
  const { data: run, error: runError } = await db.from("conti_runs").select("*").eq("id", runId).maybeSingle();
  if (runError) throw new Error(runError.message);
  if (!run) throw new Error("run을 찾을 수 없습니다.");
  const [{ data: groups, error: groupsError }, { data: scenes, error: scenesError }] = await Promise.all([
    db.from("conti_groups").select("*").eq("run_id", runId).order("sort"),
    db.from("conti_scenes").select("*").eq("run_id", runId).order("sort"),
  ]);
  if (groupsError) throw new Error(groupsError.message);
  if (scenesError) throw new Error(scenesError.message);
  return { ok: true, run, groups: groups ?? [], scenes: scenes ?? [] };
}

export async function createCanonicalConti(source: CreateCanonicalContiInput): Promise<CanonicalContiPayload> {
  if (!source.specialty || !getDepartmentDefinition(source.specialty)) throw new Error("지원하는 진료과를 선택해야 합니다.");
  const db = getSupabaseAdmin();
  const templates: SceneTemplateRow[] = buildCodeSceneTemplates(source.specialty);
  let hospitalSpaces: HospitalSpaceRow[] = [];
  let hospitalStaff: HospitalStaffRow[] = [];
  if (source.hospitalId) {
    const [spacesResult, staffResult] = await Promise.all([
      db.from("hospital_spaces").select("id, name, space_type, floor").eq("hospital_id", source.hospitalId),
      db.from("hospital_staff").select("id, name, role").eq("hospital_id", source.hospitalId),
    ]);
    hospitalSpaces = spacesResult.error ? [] : spacesResult.data ?? [];
    hospitalStaff = staffResult.error ? [] : staffResult.data ?? [];
  }
  const input: GenerateContiInput = {
    specialty: source.specialty,
    doctorCount: source.doctorCount && source.doctorCount > 0 ? source.doctorCount : 1,
    staffFlags: { siljang: Boolean(source.staffFlags?.siljang), jikwon: Boolean(source.staffFlags?.jikwon), other: Boolean(source.staffFlags?.other) },
    otherStaffRole: source.otherStaffRole || "",
    harmony: Boolean(source.harmony),
    checked: source.checked ?? {},
    extraItems: Array.isArray(source.extraItems) ? source.extraItems.filter((item): item is string => typeof item === "string") : [],
  };
  const skeleton = generateContiDraft(input, { templates, hospitalSpaces, hospitalStaff });
  const generated = { ...skeleton, scenes: await enrichContiScenes(skeleton.scenes) };
  const baseRunFields = { hospital_id: source.hospitalId ?? null, specialty: source.specialty, doctor_count: input.doctorCount, staff_flags: input.staffFlags, harmony: input.harmony, checked: input.checked };
  const fullRunFields = { ...baseRunFields, legacy_save_id: source.resourceId ?? null, workflow_run_id: source.workflowRunId ?? null, other_staff_role: input.otherStaffRole, custom_items: input.extraItems };
  let runResult = await db.from("conti_runs").insert(fullRunFields).select("*").single();
  if (runResult.error && isMissingV2Column(runResult.error)) runResult = await db.from("conti_runs").insert(baseRunFields).select("*").single();
  if (runResult.error || !runResult.data) throw new Error("콘티 저장 공간을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  const run = runResult.data;
  const groupsResult = await db.from("conti_groups").insert(generated.groups.map((group) => ({ run_id: run.id, name: group.name, sort: group.sort }))).select("id, name, sort");
  if (groupsResult.error) {
    await db.from("conti_runs").delete().eq("id", run.id);
    throw new Error(groupsResult.error.message);
  }
  const groupIdByName = new Map((groupsResult.data ?? []).map((group) => [group.name, group.id]));
  const sceneRows = generated.scenes.map((scene) => ({
    run_id: run.id, group_id: groupIdByName.get(scene.group) ?? null, sort: scene.sort, name: scene.name,
    space_text: scene.spaceText, minutes: scene.minutes, keyword: scene.keyword, description: scene.description,
    procedures: scene.procedures, people_text: scene.peopleText, patient_role_text: scene.patientRoleText,
    preparation_text: scene.preparationText, note: scene.note,
    template_id: scene.templateId?.startsWith("code:") ? null : scene.templateId, field_sources: scene.fieldSources,
  }));
  let scenesResult = await db.from("conti_scenes").insert(sceneRows).select("*");
  if (scenesResult.error && isMissingV2Column(scenesResult.error)) {
    scenesResult = await db.from("conti_scenes").insert(sceneRows.map((scene) => {
      const legacyScene = { ...scene } as Record<string, unknown>;
      delete legacyScene.preparation_text;
      return legacyScene;
    })).select("*");
  }
  if (scenesResult.error) {
    await db.from("conti_runs").delete().eq("id", run.id);
    throw new Error("콘티 장면을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return { ok: true, run, groups: groupsResult.data ?? [], scenes: scenesResult.data ?? [], spaceMatchStats: generated.spaceMatchStats };
}

const BLANK_FIELD_SOURCES = { name: "blank", space_text: "blank", minutes: "blank", keyword: "blank", description: "blank", people_text: "blank", patient_role_text: "blank", note: "blank", preparation_text: "blank" };
const EDITABLE_FIELDS = ["name", "space_text", "minutes", "keyword", "description", "people_text", "patient_role_text", "preparation_text", "note"] as const;

export async function addCanonicalContiScene(runId: string, groupId?: string | null) {
  const db = getSupabaseAdmin();
  const existing = await db.from("conti_scenes").select("sort").eq("run_id", runId).order("sort", { ascending: false }).limit(1);
  if (existing.error) throw new Error(existing.error.message);
  const result = await db.from("conti_scenes").insert({ run_id: runId, group_id: groupId ?? null, sort: (existing.data?.[0]?.sort ?? -1) + 1, name: "", space_text: "", minutes: null, keyword: "", description: "", procedures: [], people_text: "", patient_role_text: "", preparation_text: "", note: "", template_id: null, field_sources: BLANK_FIELD_SOURCES }).select("*").single();
  if (result.error || !result.data) throw new Error(result.error?.message ?? "장면 추가 실패");
  return result.data as Record<string, unknown>;
}

export async function updateCanonicalContiScene(sceneId: string, patch: { fields?: Record<string, unknown>; sort?: number; group_id?: unknown; procedures?: unknown[]; completed?: boolean }) {
  const db = getSupabaseAdmin();
  const existing = await db.from("conti_scenes").select("field_sources").eq("id", sceneId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) throw new Error("장면을 찾을 수 없습니다.");
  const update: Record<string, unknown> = {};
  if (patch.fields && typeof patch.fields === "object") {
    const sources = { ...(existing.data.field_sources as Record<string, string>) };
    for (const [key, value] of Object.entries(patch.fields)) {
      if (!EDITABLE_FIELDS.includes(key as (typeof EDITABLE_FIELDS)[number])) continue;
      update[key] = value;
      sources[key] = "user";
    }
    update.field_sources = sources;
  }
  if (typeof patch.sort === "number") update.sort = patch.sort;
  if (patch.group_id !== undefined) update.group_id = patch.group_id;
  if (Array.isArray(patch.procedures)) update.procedures = patch.procedures;
  if (typeof patch.completed === "boolean") update.completed = patch.completed;
  if (!Object.keys(update).length) throw new Error("수정할 내용이 없습니다.");
  const result = await db.from("conti_scenes").update(update).eq("id", sceneId).select("*").single();
  if (result.error || !result.data) throw new Error(result.error?.message ?? "수정 실패");
  return result.data as Record<string, unknown>;
}

export async function deleteCanonicalContiScene(sceneId: string) {
  const db = getSupabaseAdmin();
  const result = await db.from("conti_scenes").delete().eq("id", sceneId);
  if (result.error) throw new Error(result.error.message);
}
