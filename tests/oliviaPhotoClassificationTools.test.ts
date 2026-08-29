import { describe, expect, it, vi } from "vitest";

// runTool()(lib/olivia/v2/toolExecutor.ts)은 모든 도구 분기보다 먼저 getSupabaseAdmin()을
// 무조건 한 번 호출한다 — rename/merge/split_photo_scene은 db를 실제로 안 쓰지만, 그 초기화
// 자체가 테스트 환경(Supabase 환경변수 없음)에서 던지므로 다른 도구 테스트와 동일하게
// mock이 필요하다.
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: () => ({}) }),
}));

import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

// rename/merge/split_photo_scene은 DB를 안 건드린다(씬 편집 함수가 PhotoSortingWorkspace.tsx의
// 로컬 state에 묶여 있어 서버가 직접 실행할 수 없음) — 여기서는 "지금 사진 분류 화면이 열려
// 있는지" 검증과 1-based 화면 번호 → 0-based 배열 인덱스 변환만 확인한다. 실제 실행은
// uiActionResolvers.ts가 만든 RENAME/MERGE/SPLIT_PHOTO_SCENE ui_action을
// useOliviaConversationStore.ts가 가로채 usePhotoClassificationActionsStore의 등록된 함수를
// 호출할 때 일어난다(PHASE 4, 2026-08-30).

const openContext: OliviaContextSnapshot = { recentActions: [], revision: 0, activeWorkspace: "photo-sort", activeResourceId: undefined };
const closedContext: OliviaContextSnapshot = { recentActions: [], revision: 0 };

function call(name: string, input: Record<string, unknown>, context: OliviaContextSnapshot) {
  return executeAgentTool({ id: `${name}-call`, name, arguments: JSON.stringify(input) }, context);
}

describe("rename_photo_scene", () => {
  it("사진 분류 화면이 안 열려 있으면 실패한다", async () => {
    const execution = await call("rename_photo_scene", { sceneNumber: 3, newName: "상담" }, closedContext);
    expect(execution.result.success).toBe(false);
  });

  it("명시된 sceneNumber(1-based)를 0-based sceneIndex로 변환해 반환한다", async () => {
    const execution = await call("rename_photo_scene", { sceneNumber: 3, newName: "상담" }, openContext);
    expect(execution.result.success).toBe(true);
    expect(execution.result.data).toMatchObject({ sceneIndex: 2, newName: "상담" });
    expect(execution.uiActions).toEqual([{ type: "RENAME_PHOTO_SCENE", sceneIndex: 2, newName: "상담" }]);
  });

  it("sceneNumber가 없으면 선택된 씬(selectedEntityId)을 쓴다 — \"이 씬\" 팔로우업(스펙 §33)", async () => {
    const execution = await call("rename_photo_scene", { sceneNumber: null, newName: "시술" }, {
      ...openContext, selectedEntityType: "photo_scene", selectedEntityId: "5",
    });
    expect(execution.result.success).toBe(true);
    expect(execution.result.data).toMatchObject({ sceneIndex: 4, newName: "시술" });
  });

  it("sceneNumber도 없고 선택된 씬도 없으면 실패한다", async () => {
    const execution = await call("rename_photo_scene", { sceneNumber: null, newName: "시술" }, openContext);
    expect(execution.result.success).toBe(false);
  });
});

describe("merge_photo_scenes", () => {
  it("두 씬 번호를 각각 0-based 인덱스로 변환한다", async () => {
    const execution = await call("merge_photo_scenes", { sceneNumberA: 3, sceneNumberB: 4 }, openContext);
    expect(execution.result.success).toBe(true);
    expect(execution.uiActions).toEqual([{ type: "MERGE_PHOTO_SCENES", sceneIndexA: 2, sceneIndexB: 3 }]);
  });
});

describe("split_photo_scene", () => {
  it("splitBeforePhotoNumber(1-based)를 offset(0-based)으로 변환한다", async () => {
    const execution = await call("split_photo_scene", { sceneNumber: 2, splitBeforePhotoNumber: 5 }, openContext);
    expect(execution.result.success).toBe(true);
    expect(execution.uiActions).toEqual([{ type: "SPLIT_PHOTO_SCENE", sceneIndex: 1, offset: 4 }]);
  });
});
