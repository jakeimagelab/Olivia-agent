import { getSupabaseAdmin } from "@/lib/supabase";
import { generateContiDraft, type GenerateContiInput, type HospitalSpaceRow, type HospitalStaffRow, type SceneTemplateRow } from "@/lib/conti/generate";
import { buildCodeSceneTemplates, getDepartmentDefinition } from "@/lib/conti/departmentTaxonomy";
import { enrichContiScenes } from "@/lib/conti/aiEnrichment";
import { createDefaultContiStudioState, normalizeContiStudioState, type ContiStudioState } from "@/lib/conti/studioState";

export type CanonicalContiPayload = {
  ok: true;
  run: Record<string, unknown>;
  groups: Array<Record<string, unknown>>;
  scenes: Array<Record<string, unknown>>;
  spaceMatchStats?: unknown;
};

export type CreateCanonicalContiInput = {
  hospitalId?: string | null;
  hospitalName?: string | null;
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

export type ImportCanonicalContiInput = {
  hospitalId?: string | null;
  hospitalName?: string | null;
  workflowRunId?: string | null;
  title?: string | null;
  conti: Array<Record<string, unknown>>;
  checklist?: Array<Record<string, unknown>>;
  schedule?: Array<Record<string, unknown>>;
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
  let hospitalName = "";
  if (run.hospital_id) {
    const client = await db.from("clients").select("hospital_name").eq("id", run.hospital_id).maybeSingle();
    if (!client.error) hospitalName = client.data?.hospital_name?.trim() ?? "";
  }
  return { ok: true, run: { ...run, hospital_name: hospitalName }, groups: groups ?? [], scenes: scenes ?? [] };
}

export async function createCanonicalConti(source: CreateCanonicalContiInput): Promise<CanonicalContiPayload> {
  if (!source.specialty || !getDepartmentDefinition(source.specialty)) throw new Error("지원하는 진료과를 선택해야 합니다.");
  const db = getSupabaseAdmin();
  const templates: SceneTemplateRow[] = buildCodeSceneTemplates(source.specialty);
  let hospitalSpaces: HospitalSpaceRow[] = [];
  let hospitalStaff: HospitalStaffRow[] = [];
  let hospitalName = source.hospitalName?.trim() ?? "";
  if (source.hospitalId) {
    const [spacesResult, staffResult, hospitalResult] = await Promise.all([
      db.from("hospital_spaces").select("id, name, space_type, floor").eq("hospital_id", source.hospitalId),
      db.from("hospital_staff").select("id, name, role").eq("hospital_id", source.hospitalId),
      db.from("clients").select("hospital_name").eq("id", source.hospitalId).maybeSingle(),
    ]);
    hospitalSpaces = spacesResult.error ? [] : spacesResult.data ?? [];
    hospitalStaff = staffResult.error ? [] : staffResult.data ?? [];
    if (!hospitalName && !hospitalResult.error) hospitalName = hospitalResult.data?.hospital_name?.trim() ?? "";
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
  return { ok: true, run: { ...run, hospital_name: hospitalName }, groups: groupsResult.data ?? [], scenes: scenesResult.data ?? [], spaceMatchStats: generated.spaceMatchStats };
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

export async function updateCanonicalContiRun(
  runId: string,
  patch: { studioState?: ContiStudioState; hospitalId?: string | null; workflowRunId?: string | null },
) {
  const db = getSupabaseAdmin();
  const update: Record<string, unknown> = {};
  if (patch.studioState) update.studio_state = normalizeContiStudioState(patch.studioState);
  if (patch.hospitalId !== undefined) {
    update.hospital_id = patch.hospitalId;
  }
  if (patch.workflowRunId !== undefined) update.workflow_run_id = patch.workflowRunId;
  if (!Object.keys(update).length) throw new Error("수정할 콘티 정보가 없습니다.");
  const result = await db.from("conti_runs").update(update).eq("id", runId).select("*").single();
  if (result.error || !result.data) {
    if (isMissingV2Column(result.error)) throw new Error("Conti Studio DB 마이그레이션이 필요합니다.");
    throw new Error(result.error?.message ?? "콘티 저장에 실패했습니다.");
  }
  return result.data as Record<string, unknown>;
}

export async function duplicateCanonicalContiScene(sceneId: string) {
  const db = getSupabaseAdmin();
  const sourceResult = await db.from("conti_scenes").select("*").eq("id", sceneId).maybeSingle();
  if (sourceResult.error) throw new Error(sourceResult.error.message);
  if (!sourceResult.data) throw new Error("복제할 장면을 찾을 수 없습니다.");
  const source = sourceResult.data as Record<string, unknown>;
  const lastResult = await db.from("conti_scenes").select("sort").eq("run_id", source.run_id).order("sort", { ascending: false }).limit(1);
  if (lastResult.error) throw new Error(lastResult.error.message);
  const insert = {
    run_id: source.run_id,
    group_id: source.group_id ?? null,
    sort: Number(lastResult.data?.[0]?.sort ?? -1) + 1,
    name: source.name ?? "",
    space_text: source.space_text ?? "",
    minutes: source.minutes ?? null,
    keyword: source.keyword ?? "",
    description: source.description ?? "",
    procedures: source.procedures ?? [],
    people_text: source.people_text ?? "",
    patient_role_text: source.patient_role_text ?? "",
    preparation_text: source.preparation_text ?? "",
    note: source.note ?? "",
    template_id: source.template_id ?? null,
    field_sources: source.field_sources ?? {},
    completed: false,
  };
  const result = await db.from("conti_scenes").insert(insert).select("*").single();
  if (result.error || !result.data) throw new Error(result.error?.message ?? "장면 복제에 실패했습니다.");
  return result.data as Record<string, unknown>;
}

export async function reorderCanonicalContiScenes(runId: string, orderedSceneIds: string[]) {
  const db = getSupabaseAdmin();
  const current = await db.from("conti_scenes").select("id").eq("run_id", runId);
  if (current.error) throw new Error(current.error.message);
  const currentIds = (current.data ?? []).map((scene) => String(scene.id)).sort();
  const requestedIds = [...new Set(orderedSceneIds)].sort();
  if (currentIds.length !== requestedIds.length || currentIds.some((id, index) => id !== requestedIds[index])) {
    throw new Error("장면 순서 목록이 현재 콘티와 일치하지 않습니다.");
  }
  const updates = await Promise.all(orderedSceneIds.map((id, sort) => db.from("conti_scenes").update({ sort }).eq("id", id)));
  const failed = updates.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
  const verified = await db.from("conti_scenes").select("id,sort").eq("run_id", runId).order("sort");
  if (verified.error) throw new Error(verified.error.message);
  const verifiedIds = (verified.data ?? []).map((scene) => String(scene.id));
  if (verifiedIds.some((id, index) => id !== orderedSceneIds[index])) throw new Error("장면 순서 저장을 확인하지 못했습니다.");
  return verified.data ?? [];
}

export async function cloneCanonicalConti(runId: string): Promise<CanonicalContiPayload> {
  const source = await getCanonicalConti(runId);
  const db = getSupabaseAdmin();
  const sourceRun = source.run;
  const sourceStudioState = normalizeContiStudioState(sourceRun.studio_state);
  const cloneStudioState: ContiStudioState = {
    ...createDefaultContiStudioState(),
    fieldCardSize: sourceStudioState.fieldCardSize,
    extraChecklistItems: sourceStudioState.extraChecklistItems,
  };
  const runFields = {
    hospital_id: sourceRun.hospital_id ?? null,
    specialty: sourceRun.specialty ?? "",
    doctor_count: sourceRun.doctor_count ?? 1,
    staff_flags: sourceRun.staff_flags ?? {},
    harmony: Boolean(sourceRun.harmony),
    checked: sourceRun.checked ?? {},
    workflow_run_id: sourceRun.workflow_run_id ?? null,
    other_staff_role: sourceRun.other_staff_role ?? "",
    custom_items: sourceRun.custom_items ?? [],
    studio_state: cloneStudioState,
  };
  const runResult = await db.from("conti_runs").insert(runFields).select("*").single();
  if (runResult.error || !runResult.data) {
    if (isMissingV2Column(runResult.error)) throw new Error("Conti Studio DB 마이그레이션이 필요합니다.");
    throw new Error(runResult.error?.message ?? "콘티 복제에 실패했습니다.");
  }
  const newRun = runResult.data as Record<string, unknown>;

  try {
    const sortedGroups = [...source.groups].sort((left, right) => Number(left.sort ?? 0) - Number(right.sort ?? 0));
    const groupsResult = sortedGroups.length
      ? await db.from("conti_groups").insert(sortedGroups.map((group) => ({ run_id: newRun.id, name: group.name ?? "", color: group.color ?? "", sort: group.sort ?? 0 }))).select("*")
      : { data: [], error: null };
    if (groupsResult.error) throw new Error(groupsResult.error.message);
    const newGroups = (groupsResult.data ?? []) as Array<Record<string, unknown>>;
    const sourceGroupBySort = new Map(sortedGroups.map((group) => [Number(group.sort ?? 0), String(group.id)]));
    const newGroupIdBySourceId = new Map<string, unknown>();
    for (const group of newGroups) {
      const sourceId = sourceGroupBySort.get(Number(group.sort ?? 0));
      if (sourceId) newGroupIdBySourceId.set(sourceId, group.id);
    }

    const sortedScenes = [...source.scenes].sort((left, right) => Number(left.sort ?? 0) - Number(right.sort ?? 0));
    const sceneRows = sortedScenes.map((scene) => ({
      run_id: newRun.id,
      group_id: scene.group_id ? newGroupIdBySourceId.get(String(scene.group_id)) ?? null : null,
      sort: scene.sort ?? 0,
      name: scene.name ?? "",
      space_text: scene.space_text ?? "",
      minutes: scene.minutes ?? null,
      keyword: scene.keyword ?? "",
      description: scene.description ?? "",
      procedures: scene.procedures ?? [],
      people_text: scene.people_text ?? "",
      patient_role_text: scene.patient_role_text ?? "",
      preparation_text: scene.preparation_text ?? "",
      note: scene.note ?? "",
      template_id: scene.template_id ?? null,
      field_sources: scene.field_sources ?? {},
      completed: false,
    }));
    const scenesResult = sceneRows.length ? await db.from("conti_scenes").insert(sceneRows).select("*") : { data: [], error: null };
    if (scenesResult.error) throw new Error(scenesResult.error.message);
    const newScenes = (scenesResult.data ?? []) as Array<Record<string, unknown>>;

    const sortedNewScenes = [...newScenes].sort((left, right) => Number(left.sort ?? 0) - Number(right.sort ?? 0));
    sortedScenes.forEach((scene, index) => {
      const meta = sourceStudioState.sceneMeta[String(scene.id)];
      const newSceneId = sortedNewScenes[index]?.id;
      if (meta && newSceneId) cloneStudioState.sceneMeta[String(newSceneId)] = meta;
    });
    if (Object.keys(cloneStudioState.sceneMeta).length) await updateCanonicalContiRun(String(newRun.id), { studioState: cloneStudioState });

    return getCanonicalConti(String(newRun.id));
  } catch (error) {
    await db.from("conti_runs").delete().eq("id", newRun.id);
    throw error;
  }
}

function durationMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

export async function importCanonicalConti(source: ImportCanonicalContiInput): Promise<CanonicalContiPayload> {
  if (!Array.isArray(source.conti) || !source.conti.length) throw new Error("가져올 콘티 장면이 없습니다.");
  const db = getSupabaseAdmin();
  const studioState = createDefaultContiStudioState();
  studioState.extraChecklistItems = (source.checklist ?? []).map((item, index) => ({
    id: `imported-${index + 1}`,
    label: String(item.item ?? item.label ?? "").trim(),
    ...(String(item.notes ?? "").trim() ? { notes: String(item.notes).trim() } : {}),
  })).filter((item) => item.label);
  const firstScheduleTime = String(source.schedule?.[0]?.time ?? "").match(/([01]\d|2[0-3]):[0-5]\d/)?.[0];
  if (firstScheduleTime) studioState.scheduleStartTime = firstScheduleTime;

  const runResult = await db.from("conti_runs").insert({
    hospital_id: source.hospitalId ?? null,
    specialty: "imported",
    doctor_count: 1,
    staff_flags: {},
    harmony: false,
    checked: {},
    workflow_run_id: source.workflowRunId ?? null,
    other_staff_role: "",
    custom_items: [],
    studio_state: studioState,
  }).select("*").single();
  if (runResult.error || !runResult.data) {
    if (isMissingV2Column(runResult.error)) throw new Error("Conti Studio DB 마이그레이션이 필요합니다.");
    throw new Error(runResult.error?.message ?? "가져온 콘티를 저장하지 못했습니다.");
  }
  const run = runResult.data as Record<string, unknown>;
  try {
    const groupResult = await db.from("conti_groups").insert({ run_id: run.id, name: "가져온 콘티", sort: 0 }).select("*").single();
    if (groupResult.error || !groupResult.data) throw new Error(groupResult.error?.message ?? "콘티 그룹 생성 실패");
    const sceneRows = source.conti.map((row, sort) => ({
      run_id: run.id,
      group_id: groupResult.data.id,
      sort,
      name: String(row.category ?? row.name ?? `Scene ${sort + 1}`),
      space_text: String(row.location ?? row.space_text ?? ""),
      minutes: durationMinutes(row.duration ?? row.minutes),
      keyword: String(row.keyword ?? ""),
      description: String(row.description ?? ""),
      procedures: [],
      people_text: String(row.personnel ?? row.people_text ?? ""),
      patient_role_text: "",
      preparation_text: "",
      note: String(row.notes ?? row.note ?? ""),
      template_id: null,
      completed: false,
      field_sources: { name: "user", space_text: "user", minutes: "user", keyword: "user", description: "user", people_text: "user", patient_role_text: "blank", preparation_text: "blank", note: "user" },
    }));
    const scenesResult = await db.from("conti_scenes").insert(sceneRows).select("*");
    if (scenesResult.error) throw new Error(scenesResult.error.message);
    const scenes = (scenesResult.data ?? []) as Array<Record<string, unknown>>;
    source.conti.forEach((row, index) => {
      const angle = String(row.cameraAngle ?? row.camera_angle ?? "").trim();
      const sceneId = scenes.find((scene) => Number(scene.sort) === index)?.id;
      if (angle && sceneId) studioState.sceneMeta[String(sceneId)] = { cameraAngle: angle };
    });
    if (Object.keys(studioState.sceneMeta).length) await updateCanonicalContiRun(String(run.id), { studioState });
    return getCanonicalConti(String(run.id));
  } catch (error) {
    await db.from("conti_runs").delete().eq("id", run.id);
    throw error;
  }
}
