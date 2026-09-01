import { getSupabaseAdmin } from "@/lib/supabase";
import { executeOliviaCrud } from "@/lib/olivia/crud/executor";
import { parseShotPosition, resolveOrdinalReference } from "@/lib/olivia/naturalLanguageNumbers";
import { addContiShots, duplicateContiShot, estimateContiDuration, normalizeContiResult, removeContiShot, reorderContiShot, resolveContiShot, updateContiShot } from "@/lib/conti/contiMutationService";
import { getContiStatus } from "@/lib/olivia/tools/conti";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text, fromLegacyResult, activeResource } from "./common";
import { createVerification } from "./verification";

async function loadConti(id: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("conti_saves").select("*").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("현재 콘티를 불러오지 못했어요.");
  return data as Record<string, unknown>;
}

async function saveConti(id: string, result: unknown) {
  const db = getSupabaseAdmin();
  const { data: updated, error } = await db.from("conti_saves")
    .update({ result, saved_at: new Date().toISOString() })
    .eq("id", id).select("*").single();
  if (error || !updated) throw new Error("콘티를 저장하지 못했어요.");
  return updated as Record<string, unknown>;
}

export function getSelectedContiSceneId(context: OliviaContextSnapshot) {
  return context.selectedSceneId
    || (context.selectedEntityType === "conti-shot" ? context.selectedEntityId : undefined);
}

function contiTarget(conti: Record<string, unknown>, input: Record<string, unknown>, context: OliviaContextSnapshot) {
  const rawPosition = input.position;
  const shotCount = normalizeContiResult(conti.result).conti.length;
  const position = rawPosition == null ? undefined : resolveOrdinalReference(String(rawPosition), shotCount);
  const selected = getSelectedContiSceneId(context);
  const matches = resolveContiShot(conti.result, { shotId: selected, selector: text(input, "selector"), position });
  if (matches.length !== 1) {
    const choices = matches.map(({ shot }, index) => shot.keyword || shot.category || `${index + 1}번 컷`).join(", ");
    throw new Error(choices ? `대상 컷이 여러 개예요: ${choices}` : "수정할 콘티 컷을 찾지 못했어요.");
  }
  return matches[0];
}

export const CONTI_TOOL_NAMES = [
  "get_conti_status", "create_conti", "add_conti_shots", "update_conti_shot", "remove_conti_shot",
  "apply_remove_conti_shot", "reorder_conti_shot", "duplicate_conti_shot", "estimate_conti_duration",
  "generate_shoot_prep_from_conti",
] as const;

export async function executeContiTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  const db = getSupabaseAdmin();

  if (name === "get_conti_status") {
    const legacy = await getContiStatus({ hospitalName: text(input, "hospitalName") || context.activeClientName });
    const result = fromLegacyResult(name, legacy);
    // READ tool — 콘티가 없는 것은 실패가 아니다(스펙 §22). contiId가 있으면 실제로 찾은 것이다.
    return { ...result, verification: createVerification({ executed: true, resourceExists: Boolean((legacy as { contiId?: string }).contiId) }) };
  }

  if (name === "create_conti") {
    const hospitalName = text(input, "hospitalName") || context.activeClientName;
    if (!hospitalName) throw new Error("콘티를 만들 고객을 먼저 알려주세요.");
    const specialties = Array.isArray(input.specialties)
      ? input.specialties.filter((item): item is string => typeof item === "string")
      : [];
    const execution = await executeOliviaCrud(db, {
      operation: "create",
      domain: "conti",
      data: {
        hospitalName,
        title: text(input, "title") || `${hospitalName} 촬영 콘티`,
        specialties,
        result: { conti: [], checklist: [], schedule: [] },
        clientId: context.activeClientId,
        workflowRunId: context.activeProjectId,
      },
      requestText: `${hospitalName} 콘티 생성`,
    });
    const record = execution.record || {};
    return {
      tool: name,
      success: true,
      data: {
        contiId: execution.recordId,
        resourceId: execution.recordId,
        hospitalName: record.hospital_name,
        clientId: context.activeClientId,
        workflowRunId: context.activeProjectId,
      },
      verification: createVerification({ executed: true, persisted: Boolean(execution.recordId), resourceExists: Boolean(execution.recordId) }),
    };
  }

  if (["add_conti_shots", "update_conti_shot", "remove_conti_shot", "apply_remove_conti_shot", "reorder_conti_shot", "duplicate_conti_shot", "estimate_conti_duration", "generate_shoot_prep_from_conti"].includes(name)) {
    const resourceId = activeResource(context, "conti");
    const conti = await loadConti(resourceId);
    if (name === "add_conti_shots") {
      const rawItems = Array.isArray(input.items) ? input.items as Record<string, unknown>[] : [];
      if (!rawItems.length) throw new Error("추가할 항목을 확인해주세요.");
      const items = rawItems.map((item) => ({
        category: text(item, "category"),
        keyword: text(item, "keyword") || undefined,
        personnel: text(item, "personnel") || undefined,
        location: text(item, "location") || undefined,
        description: text(item, "description") || undefined,
        notes: text(item, "notes") || undefined,
      }));
      const selectedShotId = getSelectedContiSceneId(context);
      const selected = selectedShotId ? resolveContiShot(conti.result, { shotId: selectedShotId })[0] : undefined;
      const rawInsertAfter = input.insertAfter;
      const insertAfterInput = rawInsertAfter == null || rawInsertAfter === "" ? undefined : Number(rawInsertAfter);
      const insertAfter = insertAfterInput !== undefined && Number.isInteger(insertAfterInput) && insertAfterInput >= 0 ? insertAfterInput : selected?.index;
      const mutation = addContiShots(conti.result, { items, insertAfter });
      const updatedResource = await saveConti(resourceId, mutation.result);
      return {
        tool: name, success: true,
        data: { resourceId, contiId: resourceId, changedEntityId: mutation.created[0]?.id, updatedResource, summary: `${items.length}개 항목을 추가했어요.` },
        verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { addedCount: items.length } }),
      };
    }
    if (name === "estimate_conti_duration") {
      const estimate = estimateContiDuration(conti.result);
      return {
        tool: name, success: true,
        data: { resourceId, ...estimate, summary: `${estimate.shotCount}컷 기준 약 ${estimate.minMinutes}~${estimate.maxMinutes}분으로 예상돼요.${estimate.basedOnExplicitDuration ? "" : " 컷당 10분 기준 추정값이에요."}` },
        verification: createVerification({ executed: true, resourceExists: true }),
      };
    }
    if (name === "generate_shoot_prep_from_conti") {
      const result = normalizeContiResult(conti.result);
      return {
        tool: name, success: true,
        data: { resourceId, checklist: result.checklist, locations: [...new Set(result.conti.map((shot) => shot.location).filter(Boolean))], personnel: [...new Set(result.conti.map((shot) => shot.personnel).filter(Boolean))], summary: "현재 콘티와 기존 체크리스트를 기준으로 준비물을 정리했어요." },
        verification: createVerification({ executed: true, resourceExists: true }),
      };
    }
    const target = contiTarget(conti, input, context);
    if (name === "remove_conti_shot") {
      return {
        tool: name, success: true,
        data: { resourceId, contiId: resourceId, targetIndex: target.index, changedEntityId: target.shot.id || `shot:${target.index + 1}`, approvalRequired: true, summary: `${target.index + 1}번 ${target.shot.keyword || target.shot.category || "컷"}을 삭제할까요?` },
        // 삭제 승인 요청일 뿐 — 아직 아무것도 지워지지 않았다.
        verification: createVerification({ executed: true, persisted: false, resourceExists: true }),
      };
    }
    if (name === "apply_remove_conti_shot") {
      const mutation = removeContiShot(conti.result, target.index);
      const updatedResource = await saveConti(resourceId, mutation.result);
      return {
        tool: name, success: true,
        data: { resourceId, contiId: resourceId, before: mutation.removed, updatedResource, summary: `${target.index + 1}번 컷을 삭제했어요.` },
        // 삭제 대상은 이제 존재하지 않는다는 것을 details에 명확히 남긴다(스펙 §15) — conti
        // 리소스 자체는 여전히 존재하므로 최상위 resourceExists는 true로 둔다.
        verification: createVerification({ executed: true, persisted: true, resourceExists: true, details: { removedShotExists: false } }),
      };
    }
    if (name === "update_conti_shot") {
      const changes = Object.fromEntries(["category", "duration", "location", "cameraAngle", "keyword", "description", "personnel", "notes"].flatMap((key) => input[key] == null ? [] : [[key, String(input[key])]]));
      const mutation = updateContiShot(conti.result, target.index, changes);
      const updatedResource = await saveConti(resourceId, mutation.result);
      return {
        tool: name, success: true,
        data: { resourceId, contiId: resourceId, changedEntityId: mutation.after.id || `shot:${target.index + 1}`, before: mutation.before, updatedResource, summary: `${target.index + 1}번 컷을 수정했어요.` },
        verification: createVerification({ executed: true, persisted: true, resourceExists: true }),
      };
    }
    if (name === "duplicate_conti_shot") {
      const mutation = duplicateContiShot(conti.result, target.index);
      const updatedResource = await saveConti(resourceId, mutation.result);
      return {
        tool: name, success: true,
        data: { resourceId, contiId: resourceId, changedEntityId: mutation.created.id, updatedResource, summary: `${target.index + 1}번 컷을 복제했어요.` },
        verification: createVerification({ executed: true, persisted: true, resourceExists: true }),
      };
    }
    const targetPosition = text(input, "targetPosition") === "맨앞" ? 0 : parseShotPosition(input.targetPosition as string | number);
    if (targetPosition === undefined) throw new Error("이동할 위치를 확인해주세요.");
    const mutation = reorderContiShot(conti.result, target.index, targetPosition);
    const updatedResource = await saveConti(resourceId, mutation.result);
    return {
      tool: name, success: true,
      data: { resourceId, contiId: resourceId, changedEntityId: mutation.moved.id || `shot:${mutation.to + 1}`, updatedResource, summary: `${target.index + 1}번 컷을 ${mutation.to + 1}번으로 이동했어요.` },
      verification: createVerification({ executed: true, persisted: true, resourceExists: true }),
    };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
