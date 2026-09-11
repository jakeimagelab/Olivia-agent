import { afterEach, describe, expect, it, vi } from "vitest";

const canonical = vi.hoisted(() => ({
  get: vi.fn(async () => ({
    ok: true as const,
    run: { id: "conti-1" },
    groups: [],
    scenes: [
      { id: "scene-1", sort: 0, name: "외관" },
      { id: "scene-2", sort: 1, name: "원장 상담" },
    ],
  })),
  remove: vi.fn(),
}));

vi.mock("@/lib/conti/canonicalService", () => ({
  getCanonicalConti: canonical.get,
  deleteCanonicalContiScene: canonical.remove,
  createCanonicalConti: vi.fn(),
  addCanonicalContiScene: vi.fn(),
  updateCanonicalContiScene: vi.fn(),
}));

import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";

describe("canonical V2 conti delete approval", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("승인 요청은 exact scene을 찾지만 삭제하지 않고 승인 action을 만든다", async () => {
    canonical.get.mockClear();
    canonical.remove.mockClear();

    const execution = await executeAgentTool({
      id: "call-1",
      name: "request_remove_conti_scene_v2",
      arguments: JSON.stringify({ contiId: "conti-1", position: 2 }),
    }, { recentActions: [], revision: 0, activeWorkspace: "conti", activeResourceId: "conti-1" });

    expect(execution.result).toMatchObject({
      success: true,
      data: { contiId: "conti-1", sceneId: "scene-2", targetPosition: 2, approvalRequired: true },
      verification: { executed: true, persisted: false },
    });
    expect(execution.uiActions[0]).toMatchObject({
      type: "REQUEST_APPROVAL",
      toolName: "remove_conti_scene_v2",
      toolInput: { contiId: "conti-1", sceneId: "scene-2" },
    });
    expect(canonical.get).toHaveBeenCalledTimes(1);
    expect(canonical.remove).not.toHaveBeenCalled();
  });
});
