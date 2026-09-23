import { describe, expect, it, vi } from "vitest";
import {
  executePhotoDirectTurn,
  isPhotoDirectExecutionEnabled,
  parsePhotoDirectCommand,
  readPendingPhotoDirectExecution,
  shouldGuardPhotoDirectTurn,
  type PhotoDirectFolderCandidate,
} from "@/lib/photo-storage/directChatExecution";
import type { OliviaAgentToolExecution } from "@/lib/olivia/v2/types";

const context = { recentActions: [], revision: 0 };

function candidate(name: string, overrides: Partial<PhotoDirectFolderCandidate> = {}): PhotoDirectFolderCandidate {
  return {
    displayName: name,
    sourceRelativePath: name,
    fileCount: 200,
    jpgCount: 100,
    jpgBytes: 1_000,
    rawCount: 100,
    totalBytes: 2_000,
    modifiedAt: "2026-09-20T01:00:00.000Z",
    projectStatus: "READY",
    ...overrides,
  };
}

function success(tool: string, data: Record<string, unknown>): OliviaAgentToolExecution {
  return { result: { tool, success: true, data, verification: { executed: true } }, uiActions: [] };
}

function failure(tool: string, error: string, code = "TOOL_EXECUTION_FAILED", details?: Record<string, unknown>): OliviaAgentToolExecution {
  return { result: { tool, success: false, error, code, details, verification: { executed: false } }, uiActions: [] };
}

function executor(options: {
  folders?: Record<string, PhotoDirectFolderCandidate[]>;
  start?: (name: string, input: Record<string, unknown>) => OliviaAgentToolExecution;
} = {}) {
  let sequence = 0;
  return vi.fn(async (name: string, input: Record<string, unknown>) => {
    sequence += 1;
    if (name === "find_photo_folder") {
      const query = String(input.query);
      return { id: `call-${sequence}`, execution: success(name, { candidates: options.folders?.[query] ?? [] }) };
    }
    return {
      id: `call-${sequence}`,
      execution: options.start?.(name, input) ?? success(name, {
        summary: "작업을 시작했습니다. 진행 중입니다.",
      }),
    };
  });
}

describe("사진 작업 직접 실행 명령 파서", () => {
  it.each([
    ["0918 삼칠갈비 원본 분리해줘", "source_prep", ["0918 삼칠갈비"]],
    ["0918 삼 칠 갈 비 원본 분류해줘", "source_prep", ["0918 삼 칠 갈 비"]],
    ["나스에스 0918 삼칠갈비 원본 분류해줘", "source_prep", ["0918 삼칠갈비"]],
    ["Workstation에서 0918_삼칠갈비 원본 분리해줘", "source_prep", ["0918_삼칠갈비"]],
    ["0918_삼칠갈비 RAW와 JPG로 분리해줘", "source_prep", ["0918_삼칠갈비"]],
    ["르셀청담 JPG 통합해줘", "source_prep", ["르셀청담"]],
    ["올리비아, 0911_WINF > JPG만 분리해줄래", "source_prep", ["0911_WINF"]],
    ["0911_WINF JPG만 줄래", "source_prep", ["0911_WINF"]],
    ["르셀청담이랑 세무사회 두 개 분리해줘", "source_prep", ["르셀청담", "세무사회"]],
    ["삼칠갈비 씬별 분류해줘", "scene_sort", ["삼칠갈비"]],
    ["삼칠갈비 2차 분류해줘", "scene_sort", ["삼칠갈비"]],
  ])("'%s'를 %s로 안전하게 식별한다", (message, operation, folderQueries) => {
    expect(parsePhotoDirectCommand(message)).toMatchObject({ operation, folderQueries });
  });

  it("일반 질문과 다른 사진 작업은 직접 실행 대상으로 만들지 않는다", () => {
    expect(parsePhotoDirectCommand("오늘 일정 뭐야")).toBeNull();
    expect(parsePhotoDirectCommand("삼칠갈비 RAW 매칭해줘")).toBeNull();
    expect(parsePhotoDirectCommand("삼칠갈비 Scene을 분리해줘")).toBeNull();
    expect(parsePhotoDirectCommand("삼칠갈비 사진을 둘로 분리해줘")).toBeNull();
    expect(parsePhotoDirectCommand("사진 분류와 원본 분리를 둘 다 해줘")).toBeNull();
  });

  it("환경변수는 값이 정확히 1일 때만 켜진다", () => {
    expect(isPhotoDirectExecutionEnabled("1")).toBe(true);
    expect(isPhotoDirectExecutionEnabled("0")).toBe(false);
    expect(isPhotoDirectExecutionEnabled(undefined)).toBe(false);
  });
});

describe("사진 작업 직접 실행 오케스트레이터", () => {
  it("비활성 상태에서는 명확한 사진 명령도 실행하지 않는다", async () => {
    const executeTool = executor({ folders: { "0918 삼칠갈비": [candidate("0918_삼칠갈비")] } });
    const result = await executePhotoDirectTurn({
      enabled: false,
      userMessage: "0918 삼칠갈비 원본 분리해줘",
      hermesToolNames: [],
      context,
      executeTool,
    });
    expect(result).toMatchObject({ handled: false, reason: "disabled" });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("Hermes가 사진 도구를 이미 호출했으면 중복 실행하지 않는다", async () => {
    const executeTool = executor();
    const result = await executePhotoDirectTurn({
      enabled: true,
      userMessage: "0918 삼칠갈비 원본 분리해줘",
      hermesToolNames: ["mcp_olivia_find_photo_folder"],
      context,
      executeTool,
    });
    expect(result).toMatchObject({ handled: false, reason: "hermes_already_called" });
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("단일 후보는 기존 검색 도구 뒤 기존 원본 분리 도구로 주문한다", async () => {
    const executeTool = executor({ folders: { "0918 삼칠갈비": [candidate("0918_삼칠갈비")] } });
    const result = await executePhotoDirectTurn({
      enabled: true,
      userMessage: "0918 삼칠갈비 원본 분리해줘",
      hermesToolNames: [],
      context,
      executeTool,
    });
    expect(result).toMatchObject({ handled: true, reason: "executed", pendingState: null });
    expect(result.text).toContain("0918_삼칠갈비");
    expect(result.text).toContain("작업을 시작했습니다. 진행 중입니다.");
    expect(executeTool.mock.calls.map(([name]) => name)).toEqual(["find_photo_folder", "start_photo_source_prep"]);
    expect(executeTool.mock.calls[1][1]).toEqual({ folderName: "0918_삼칠갈비", confirmRestart: false });
  });

  it("복수 후보는 장수·용량·수정일을 보여주고 선택 전에는 쓰지 않는다", async () => {
    const executeTool = executor({
      folders: {
        르셀청담: [
          candidate("0730_르셀청담", { fileCount: 5_558, totalBytes: 127 * 1024 ** 3 }),
          candidate("0812_르셀청담", { fileCount: 419, totalBytes: 7.3 * 1024 ** 3 }),
        ],
      },
    });
    const first = await executePhotoDirectTurn({ enabled: true, userMessage: "르셀청담 원본 분리해줘", hermesToolNames: [], context, executeTool });
    expect(first).toMatchObject({ handled: true, reason: "needs_input", pendingState: { stage: "choose_folder" } });
    expect(first.text).toContain("0730_르셀청담");
    expect(first.text).toContain("5,558장");
    expect(first.text).toContain("127GB");
    expect(first.text).toContain("2026");
    expect(executeTool.mock.calls.map(([name]) => name)).toEqual(["find_photo_folder"]);

    const second = await executePhotoDirectTurn({
      enabled: true,
      userMessage: "2번",
      hermesToolNames: [],
      pendingState: first.pendingState ?? undefined,
      context,
      executeTool,
    });
    expect(second).toMatchObject({ handled: true, reason: "executed", pendingState: null });
    expect(executeTool.mock.calls.at(-1)?.[1]).toEqual({ folderName: "0812_르셀청담", confirmRestart: false });
  });

  it("후보가 없으면 파일 업로드를 제안하지 않고 쓰기 도구도 호출하지 않는다", async () => {
    const executeTool = executor({ folders: { 없는병원: [] } });
    const result = await executePhotoDirectTurn({ enabled: true, userMessage: "없는병원 원본 분리해줘", hermesToolNames: [], context, executeTool });
    expect(result).toMatchObject({ handled: true, reason: "needs_input", pendingState: { stage: "folder_retry" } });
    expect(result.text).toContain("Workstation");
    expect(result.text).toContain("정확한 폴더명");
    expect(result.text).not.toMatch(/업로드/);
    expect(executeTool.mock.calls.map(([name]) => name)).toEqual(["find_photo_folder"]);
  });

  it("검색 결과가 없으면 사용자가 알려준 정확한 폴더명으로 다시 검색해 실행한다", async () => {
    const executeTool = executor({
      folders: {
        "0918 삼칠갈비": [],
        "0918_삼칠갈비": [candidate("0918_삼칠갈비")],
      },
    });
    const first = await executePhotoDirectTurn({
      enabled: true,
      userMessage: "나스에스 0918 삼칠갈비 원본 분류해줘",
      hermesToolNames: [],
      context,
      executeTool,
    });
    expect(first).toMatchObject({ handled: true, reason: "needs_input", pendingState: { stage: "folder_retry" } });

    const second = await executePhotoDirectTurn({
      enabled: true,
      userMessage: "0918_삼칠갈비야",
      hermesToolNames: [],
      pendingState: first.pendingState ?? undefined,
      context,
      executeTool,
    });

    expect(second).toMatchObject({ handled: true, reason: "executed", pendingState: null });
    expect(executeTool.mock.calls.map(([name]) => name)).toEqual([
      "find_photo_folder",
      "find_photo_folder",
      "start_photo_source_prep",
    ]);
    expect(executeTool.mock.calls[1][1]).toEqual({ query: "0918_삼칠갈비" });
  });

  it("검색 실패 뒤 현재 답변의 폴더명만 재검색하고 이전 요청 문장을 합치지 않는다", async () => {
    const executeTool = executor({
      folders: {
        "0911 WINF": [],
        "0911_WINF": [candidate("0911_WINF")],
      },
    });
    const first = await executePhotoDirectTurn({
      enabled: true,
      userMessage: "올리비아, 0911 WINF > JPG만 분리해줄래",
      hermesToolNames: [],
      context,
      executeTool,
    });
    expect(first).toMatchObject({ handled: true, reason: "needs_input", pendingState: { stage: "folder_retry" } });

    const second = await executePhotoDirectTurn({
      enabled: true,
      userMessage: "0911_WINF",
      hermesToolNames: [],
      pendingState: first.pendingState ?? undefined,
      context,
      executeTool,
    });

    expect(second).toMatchObject({ handled: true, reason: "executed" });
    expect(executeTool.mock.calls[1]?.[1]).toEqual({ query: "0911_WINF" });
    expect(executeTool.mock.calls.map(([, input]) => input.query).filter(Boolean)).toEqual(["0911 WINF", "0911_WINF"]);
  });

  it("Scene 분류는 폴더를 확정해도 진료과와 촬영모드 전에는 시작하지 않는다", async () => {
    const executeTool = executor({ folders: { 삼칠갈비: [candidate("0918_삼칠갈비")] } });
    const first = await executePhotoDirectTurn({ enabled: true, userMessage: "삼칠갈비 씬 분류해줘", hermesToolNames: [], context, executeTool });
    expect(first).toMatchObject({ handled: true, reason: "needs_input", pendingState: { stage: "scene_settings" } });
    expect(first.text).toContain("진료과");
    expect(first.text).toContain("현장/스튜디오");
    expect(executeTool.mock.calls.map(([name]) => name)).toEqual(["find_photo_folder"]);

    const second = await executePhotoDirectTurn({
      enabled: true,
      userMessage: "피부과 현장",
      hermesToolNames: [],
      pendingState: first.pendingState ?? undefined,
      context,
      executeTool,
    });
    expect(second).toMatchObject({ handled: true, reason: "executed", pendingState: null });
    expect(executeTool.mock.calls.at(-1)?.[1]).toEqual({
      folderName: "0918_삼칠갈비",
      confirmRestart: false,
      department: "dermatology",
      shootingMode: "field",
    });
  });

  it("완료 작업은 재시작 동의 전에는 다시 주문하지 않는다", async () => {
    const executeTool = executor({
      folders: { 삼칠갈비: [candidate("0918_삼칠갈비", { projectStatus: "MERGE_COMPLETED" })] },
      start: (name, input) => input.confirmRestart === true
        ? success(name, { summary: "JPG 통합 작업을 다시 주문했어요." })
        : failure(name, "기존 작업 기록이 있어요.", "PHOTO_PROJECT_RESTART_CONFIRMATION_REQUIRED", { status: "MERGE_COMPLETED" }),
    });
    const first = await executePhotoDirectTurn({ enabled: true, userMessage: "삼칠갈비 원본 분리해줘", hermesToolNames: [], context, executeTool });
    expect(first).toMatchObject({ handled: true, reason: "needs_input", pendingState: { stage: "restart_confirmation" } });
    expect(first.text).toContain("MERGE_COMPLETED");
    expect(executeTool.mock.calls.at(-1)?.[1]).toMatchObject({ confirmRestart: false });

    const second = await executePhotoDirectTurn({
      enabled: true,
      userMessage: "응 다시 해줘",
      hermesToolNames: [],
      pendingState: first.pendingState ?? undefined,
      context,
      executeTool,
    });
    expect(second).toMatchObject({ handled: true, reason: "executed" });
    expect(executeTool.mock.calls.at(-1)?.[1]).toMatchObject({ confirmRestart: true });
  });

  it("현재 context가 read-only이면 검색만 하고 쓰기 작업은 만들지 않는다", async () => {
    const executeTool = executor({ folders: { 삼칠갈비: [candidate("0918_삼칠갈비")] } });
    const result = await executePhotoDirectTurn({
      enabled: true,
      userMessage: "삼칠갈비 원본 분리해줘",
      hermesToolNames: [],
      context: { ...context, canEdit: false },
      executeTool,
    });
    expect(result.text).toContain("권한이 없어요");
    expect(result.text).toContain("원본은 변경하지 않았어요");
    expect(executeTool.mock.calls.map(([name]) => name)).toEqual(["find_photo_folder"]);
  });

  it("여러 폴더 중 하나가 실패해도 나머지를 독립적으로 계속한다", async () => {
    const executeTool = executor({
      folders: {
        르셀청담: [candidate("0730_르셀청담")],
        세무사회: [candidate("0811_세무사회")],
      },
      start: (name, input) => String(input.folderName).includes("르셀")
        ? failure(name, "동일 이름 JPG 충돌")
        : success(name, { summary: "작업을 시작했습니다. 진행 중입니다." }),
    });
    const result = await executePhotoDirectTurn({
      enabled: true,
      userMessage: "르셀청담이랑 세무사회 두 개 분리해줘",
      hermesToolNames: [],
      context,
      executeTool,
    });
    expect(result).toMatchObject({ handled: true, reason: "executed", pendingState: null });
    expect(result.text).toContain("0730_르셀청담 — 실패");
    expect(result.text).toContain("0811_세무사회");
    expect(executeTool.mock.calls.filter(([name]) => name === "start_photo_source_prep")).toHaveLength(2);
  });

  it("대기 상태는 안전한 상대경로 정보만 복원하고 관련 없는 후속 말은 소비하지 않는다", async () => {
    const executeTool = executor({ folders: { 르셀청담: [candidate("0730_르셀청담"), candidate("0812_르셀청담")] } });
    const first = await executePhotoDirectTurn({ enabled: true, userMessage: "르셀청담 원본 분리해줘", hermesToolNames: [], context, executeTool });
    const restored = readPendingPhotoDirectExecution({ pendingPhotoDirectExecution: first.pendingState });
    expect(restored?.stage).toBe("choose_folder");
    expect(shouldGuardPhotoDirectTurn({ enabled: true, userMessage: "오늘 일정 뭐야", pendingState: restored })).toBe(false);
    const unrelated = await executePhotoDirectTurn({ enabled: true, userMessage: "오늘 일정 뭐야", hermesToolNames: [], pendingState: restored, context, executeTool });
    expect(unrelated).toMatchObject({ handled: false, reason: "no_intent" });
  });
});
