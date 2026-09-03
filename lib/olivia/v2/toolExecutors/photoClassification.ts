import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { text } from "./common";
import { createVerification } from "./verification";

// 사진 분류 씬 편집(PHASE 4, 2026-08-30) — 실제 실행은 지금 열려 있는 PhotoSortingWorkspace
// 안에서만 가능하다(파일시스템 핸들이 클라이언트에만 있음). 이 도구들은 "지금 화면이 열려
// 있는지"만 확인하고 실제 실행은 client_task 이후 ui_action(RENAME/MERGE/SPLIT_PHOTO_SCENE)이
// 처리한다 — 사람이 왼쪽 화면에서 직접 이름을 바꾸는 것과 정확히 같은 함수를 호출한다.
function resolvePhotoSceneNumber(input: Record<string, unknown>, key: string, context: OliviaContextSnapshot): number {
  const explicit = input[key];
  if (explicit != null) {
    const n = Number(explicit);
    if (!Number.isFinite(n) || n < 1) throw new Error("씬 번호를 확인해주세요.");
    return n;
  }
  if (context.selectedEntityType === "photo_scene" && context.selectedEntityId) {
    const n = Number(context.selectedEntityId);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  throw new Error("몇 번 씬인지 알려주세요.");
}

export const PHOTO_CLASSIFICATION_TOOL_NAMES = [
  "rename_photo_scene", "merge_photo_scenes", "split_photo_scene",
  "start_ai_photo_classification", "refine_photo_classification",
] as const;

export async function executePhotoClassificationTool(
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  if (context.activeWorkspace !== "photo-sort") throw new Error("먼저 사진 분류 화면을 열어주세요.");

  if (name === "rename_photo_scene") {
    const sceneNumber = resolvePhotoSceneNumber(input, "sceneNumber", context);
    const newName = text(input, "newName");
    if (!newName) throw new Error("바꿀 이름을 알려주세요.");
    // client-only 작업(스펙 §18) — 실제 파일시스템 반영은 client의 ui_action 처리 이후에나
    // 확정되므로 persisted를 단정하지 않는다.
    return { tool: name, success: true, data: { sceneIndex: sceneNumber - 1, newName, summary: `${sceneNumber}번 씬 이름을 바꿀게요.` }, verification: createVerification({ executed: true }) };
  }

  if (name === "merge_photo_scenes") {
    const sceneNumberA = resolvePhotoSceneNumber(input, "sceneNumberA", context);
    const sceneNumberB = Number(input.sceneNumberB);
    if (!Number.isFinite(sceneNumberB) || sceneNumberB < 1) throw new Error("합칠 씬 번호를 확인해주세요.");
    return { tool: name, success: true, data: { sceneIndexA: sceneNumberA - 1, sceneIndexB: sceneNumberB - 1, summary: `${sceneNumberA}번과 ${sceneNumberB}번 씬을 합칠게요.` }, verification: createVerification({ executed: true }) };
  }

  if (name === "split_photo_scene") {
    const sceneNumber = resolvePhotoSceneNumber(input, "sceneNumber", context);
    const splitBeforePhotoNumber = Number(input.splitBeforePhotoNumber);
    if (!Number.isFinite(splitBeforePhotoNumber) || splitBeforePhotoNumber < 2) throw new Error("나눌 사진 위치를 확인해주세요.");
    return { tool: name, success: true, data: { sceneIndex: sceneNumber - 1, offset: splitBeforePhotoNumber - 1, summary: `${sceneNumber}번 씬을 나눌게요.` }, verification: createVerification({ executed: true }) };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
