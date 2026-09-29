import { describe, expect, it, vi } from "vitest";
import { executePhotoDirectTurn } from "@/lib/photo-storage/directChatExecution";
import type { OliviaAgentToolExecution } from "@/lib/olivia/v2/types";
import type { RemoteNasDataSource } from "@/lib/remote-nas/types";

const context = { recentActions: [], revision: 0 };
const folderName = "0923_연세라이프구강";

function execution(result: OliviaAgentToolExecution["result"]): OliviaAgentToolExecution {
  return { result, uiActions: [] };
}

function dataSource(): RemoteNasDataSource {
  const root = {
    rootName: "Workstation(M.2SSD)" as const,
    path: "",
    displayPath: "Workstation(M.2SSD)",
    entries: [{
      kind: "directory" as const,
      name: folderName,
      path: folderName,
      displayName: folderName,
      displayPath: folderName,
      sizeBytes: null,
      modifiedAt: null,
    }],
    connection: { macStudio: "online" as const, nas: "connected" as const, source: "mock" as const },
    readOnly: true as const,
  };
  return { listRoot: vi.fn(async () => root), listFolder: vi.fn(async () => root) };
}

function timeoutExecution(): OliviaAgentToolExecution {
  return execution({
    tool: "start_photo_source_prep",
    success: false,
    code: "PHOTO_DIRECT_TIMEOUT",
    error: "잡 생성 응답이 지연됐습니다.",
    verification: { details: { stage: "잡 생성", timedOut: true } },
  });
}

async function runWithStatus(status: () => OliviaAgentToolExecution) {
  let sequence = 0;
  const executeTool = vi.fn(async (name: string) => {
    sequence += 1;
    if (name === "start_photo_source_prep") return { id: `call-${sequence}`, execution: timeoutExecution() };
    if (name === "get_photo_storage_status") return { id: `call-${sequence}`, execution: status() };
    throw new Error(`unexpected tool ${name}`);
  });
  const result = await executePhotoDirectTurn({
    enabled: true,
    userMessage: "연세라이프구강내과 JPG정리 좀 해줘",
    hermesToolNames: [],
    context,
    dataSource: dataSource(),
    executeTool,
    verificationWaitMs: 0,
  });
  return { result, executeTool };
}

describe("photo direct timeout verification", () => {
  it("타임아웃 뒤 요청 이후 갱신된 프로젝트를 찾으면 시작됨으로 보고하고 상태 도구를 실제 호출한다", async () => {
    const { result, executeTool } = await runWithStatus(() => execution({
      tool: "get_photo_storage_status",
      success: true,
      data: { project: { updatedAt: "2999-01-01T00:00:00.000Z" } },
    }));

    expect(executeTool.mock.calls.map(([name]) => name)).toEqual([
      "start_photo_source_prep",
      "get_photo_storage_status",
    ]);
    expect(result.text).toContain("응답은 늦었지만 작업은 시작됐어요");
    expect(result.text).not.toContain("실패");
    expect(result.text).not.toContain("원본은 변경하지 않았어요");
  });

  it("프로젝트가 없으면 미시작으로 보고 원본 미변경을 붙인다", async () => {
    const { result } = await runWithStatus(() => execution({
      tool: "get_photo_storage_status",
      success: false,
      error: "해당 촬영 프로젝트를 찾지 못했어요.",
    }));

    expect(result.text).toContain("시작되지 않았어요");
    expect(result.text).toContain("원본은 변경하지 않았어요");
  });

  it("조회 자체가 실패하면 확인 불가로 보고 원본 미변경을 말하지 않는다", async () => {
    const { result, executeTool } = await runWithStatus(() => execution({
      tool: "get_photo_storage_status",
      success: false,
      error: "권한 없음",
    }));

    expect(executeTool.mock.calls.filter(([name]) => name === "get_photo_storage_status")).toHaveLength(3);
    expect(result.text).toContain("시작됐는지 확인하지 못했어요");
    expect(result.text).not.toContain("원본은 변경하지 않았어요");
  });

  it("확실한 start-tool 실패는 상태 재조회 없이 원본 미변경을 보고한다", async () => {
    let sequence = 0;
    const executeTool = vi.fn(async (name: string) => {
      sequence += 1;
      return {
        id: `call-${sequence}`,
        execution: execution({ tool: name, success: false, error: "권한이 없어요.", code: "PERMISSION_DENIED" }),
      };
    });
    const result = await executePhotoDirectTurn({
      enabled: true,
      userMessage: "연세라이프구강내과 JPG정리 좀 해줘",
      hermesToolNames: [],
      context,
      dataSource: dataSource(),
      executeTool,
      verificationWaitMs: 0,
    });

    expect(executeTool.mock.calls.map(([name]) => name)).toEqual(["start_photo_source_prep"]);
    expect(result.text).toContain("원본은 변경하지 않았어요");
  });
});
