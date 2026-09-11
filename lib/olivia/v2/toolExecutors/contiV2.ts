import { searchOliviaClients } from "@/lib/olivia/clientSearch";
import { DEPARTMENT_TAXONOMY, getDepartmentDefinition } from "@/lib/conti/departmentTaxonomy";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { callOliviaApi } from "./http";
import { text } from "./common";
import { createVerification } from "./verification";
import { addCanonicalContiScene, createCanonicalConti, deleteCanonicalContiScene, getCanonicalConti, updateCanonicalContiScene, type CanonicalContiPayload } from "@/lib/conti/canonicalService";

type ContiPayload = CanonicalContiPayload;

export const CONTI_V2_TOOL_NAMES = [
  "create_conti_v2", "get_conti_v2", "update_conti_scene_v2", "add_conti_scene_v2",
  "request_remove_conti_scene_v2", "remove_conti_scene_v2", "reorder_conti_scene_v2",
  "get_conti_field_view_v2", "preview_conti_v2",
] as const;

async function loadConti(runId: string): Promise<ContiPayload> {
  return getCanonicalConti(runId);
}

function resolveScene(payload: ContiPayload, input: Record<string, unknown>) {
  const ordered = [...payload.scenes].sort((a, b) => Number(a.sort) - Number(b.sort));
  const sceneId = text(input, "sceneId");
  if (sceneId) {
    const scene = ordered.find((item) => item.id === sceneId);
    if (!scene) throw new Error("수정할 콘티 장면을 찾지 못했어요.");
    return { scene, ordered };
  }
  const position = Number(input.position);
  if (!Number.isInteger(position) || position < 1 || position > ordered.length) throw new Error("장면 ID 또는 1부터 시작하는 장면 번호가 필요해요.");
  return { scene: ordered[position - 1], ordered };
}

function contiId(input: Record<string, unknown>, context: OliviaContextSnapshot) {
  const id = text(input, "contiId") || context.activeResourceId;
  if (!id) throw new Error("현재 콘티 ID가 필요해요.");
  return id;
}

function normalizeSpecialty(value: string) {
  if (getDepartmentDefinition(value)) return value;
  const compact = value.replace(/\s+/g, "").replace(/과$/, "");
  const match = DEPARTMENT_TAXONOMY.find((department) =>
    [department.id, department.label, ...(department.aliases ?? [])]
      .some((candidate) => candidate.replace(/\s+/g, "").replace(/과$/, "") === compact),
  );
  return match?.label || value;
}

export async function executeContiV2Tool(name: string, input: Record<string, unknown>, context: OliviaContextSnapshot): Promise<OliviaToolResult> {
  if (name === "create_conti_v2") {
    let clientId = text(input, "clientId") || context.activeClientId;
    let specialty = text(input, "specialty");
    const hospitalName = text(input, "hospitalName") || context.activeClientName;
    if (!clientId && hospitalName) {
      const found = await searchOliviaClients(hospitalName);
      if (found.clients.length !== 1) throw new Error(found.clients.length ? "비슷한 고객이 여러 곳이에요. 고객을 먼저 확정해주세요." : "등록된 고객을 찾지 못했어요.");
      clientId = found.clients[0].id;
      specialty ||= found.clients[0].specialty || "";
    }
    if (clientId && !specialty) {
      const detail = await callOliviaApi<{ ok: boolean; client: Record<string, unknown> }>(`/api/clients/${clientId}`);
      specialty = String(detail.client.specialty || detail.client.department || "");
    }
    const checked = input.checked && typeof input.checked === "object" && !Array.isArray(input.checked) ? input.checked : {};
    const extraItems = Array.isArray(input.extraItems) ? input.extraItems : [];
    const staffFlags = input.staffFlags && typeof input.staffFlags === "object" && !Array.isArray(input.staffFlags) ? input.staffFlags : {};
    if (!specialty) throw new Error("콘티 생성을 위해 진료과를 알려주세요.");
    specialty = normalizeSpecialty(specialty);
    if (!Object.keys(checked as object).length && !extraItems.length && !Object.values(staffFlags as object).some(Boolean) && !input.harmony) {
      throw new Error("콘티에 넣을 촬영 항목을 하나 이상 알려주세요.");
    }
    const created = await createCanonicalConti({ hospitalId: clientId || null, workflowRunId: text(input, "workflowRunId") || context.activeProjectId || null, specialty, doctorCount: Number(input.doctorCount) || 1, staffFlags, harmony: Boolean(input.harmony), checked: checked as Record<string, string[]>, extraItems: extraItems as string[] });
    const runId = String(created.run.id || "");
    if (!runId) throw new Error("콘티 저장 결과에서 ID를 확인하지 못했어요.");
    const readBack = await loadConti(runId);
    if (readBack.run.specialty !== specialty || readBack.scenes.length !== created.scenes.length) throw new Error("콘티 저장 검증 값이 요청 결과와 일치하지 않아요.");
    return { tool: name, success: true, data: { contiId: runId, resourceId: runId, run: readBack.run, groups: readBack.groups, scenes: readBack.scenes, summary: `${readBack.scenes.length}개 장면의 콘티를 만들었어요.` }, verification: createVerification({ executed: true, persisted: true, resourceExists: true, linked: Boolean(clientId), details: { sceneCount: readBack.scenes.length } }) };
  }

  const runId = contiId(input, context);
  if (["get_conti_v2", "get_conti_field_view_v2", "preview_conti_v2"].includes(name)) {
    const payload = await loadConti(runId);
    return { tool: name, success: true, data: { contiId: runId, resourceId: runId, ...payload, view: name === "get_conti_field_view_v2" ? "field" : "preview" }, verification: createVerification({ executed: true, resourceExists: true, details: { sceneCount: payload.scenes.length } }) };
  }

  const before = await loadConti(runId);
  if (name === "add_conti_scene_v2") {
    const groupId = text(input, "groupId") || (before.scenes.at(-1)?.group_id as string | undefined) || null;
    const createdScene = await addCanonicalContiScene(runId, groupId);
    const fields = input.fields && typeof input.fields === "object" && !Array.isArray(input.fields) ? input.fields : {};
    if (Object.keys(fields as object).length) await updateCanonicalContiScene(String(createdScene.id), { fields: fields as Record<string, unknown> });
    const readBack = await loadConti(runId);
    const scene = readBack.scenes.find((item) => item.id === createdScene.id);
    if (!scene) throw new Error("추가한 콘티 장면을 다시 확인하지 못했어요.");
    return { tool: name, success: true, data: { contiId: runId, resourceId: runId, sceneId: scene.id, scene, summary: "콘티 장면을 추가했어요." }, verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { sceneCount: readBack.scenes.length } }) };
  }

  const { scene, ordered } = resolveScene(before, input);
  const sceneId = String(scene.id);
  if (name === "request_remove_conti_scene_v2") {
    const targetPosition = ordered.findIndex((item) => item.id === sceneId) + 1;
    return {
      tool: name,
      success: true,
      data: {
        contiId: runId,
        resourceId: runId,
        sceneId,
        targetPosition,
        approvalRequired: true,
        summary: `${targetPosition}번 ${String(scene.name || scene.keyword || "장면")}을 삭제할까요?`,
      },
      verification: createVerification({ executed: true, persisted: false, resourceExists: true }),
    };
  }
  if (name === "update_conti_scene_v2") {
    const fields = input.fields && typeof input.fields === "object" && !Array.isArray(input.fields) ? input.fields as Record<string, unknown> : {};
    if (!Object.keys(fields).length) throw new Error("수정할 장면 필드를 알려주세요.");
    await updateCanonicalContiScene(sceneId, { fields });
    const readBack = await loadConti(runId);
    const updated = readBack.scenes.find((item) => item.id === sceneId);
    if (!updated || Object.entries(fields).some(([key, value]) => updated[key] !== value)) throw new Error("콘티 장면 수정 검증 값이 일치하지 않아요.");
    return { tool: name, success: true, data: { contiId: runId, resourceId: runId, sceneId, scene: updated, summary: "콘티 장면을 수정했어요." }, verification: createVerification({ executed: true, persisted: true, resourceExists: true }) };
  }

  if (name === "remove_conti_scene_v2") {
    await deleteCanonicalContiScene(sceneId);
    const readBack = await loadConti(runId);
    if (readBack.scenes.some((item) => item.id === sceneId)) throw new Error("삭제한 콘티 장면이 아직 남아 있어요.");
    return { tool: name, success: true, data: { contiId: runId, resourceId: runId, sceneId, summary: "콘티 장면을 삭제했어요." }, verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { removedSceneExists: false } }) };
  }

  if (name === "reorder_conti_scene_v2") {
    const targetPosition = Number(input.targetPosition);
    if (!Number.isInteger(targetPosition) || targetPosition < 1 || targetPosition > ordered.length) throw new Error("이동할 장면 번호를 확인해주세요.");
    const from = ordered.findIndex((item) => item.id === sceneId);
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(targetPosition - 1, 0, moved);
    await Promise.all(next.map((item, index) => updateCanonicalContiScene(String(item.id), { sort: index, group_id: item.group_id })));
    const readBack = await loadConti(runId);
    const verified = [...readBack.scenes].sort((a, b) => Number(a.sort) - Number(b.sort));
    if (verified[targetPosition - 1]?.id !== sceneId) throw new Error("콘티 장면 순서 변경이 실제로 저장되지 않았어요.");
    return { tool: name, success: true, data: { contiId: runId, resourceId: runId, sceneId, targetPosition, scenes: verified, summary: `${targetPosition}번 장면으로 이동했어요.` }, verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { targetPosition } }) };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
