import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  summarize: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/core/readModels/projectSnapshot", () => ({
  getCoreProjectSnapshot: dependencies.getSnapshot,
  summarizeCoreProjectSnapshot: dependencies.summarize,
}));

const workflowRunId = "11111111-1111-4111-8111-111111111111";
const snapshot = {
  client: { id: "client-1", name: "기통찬의원" },
  project: { workflowRunId, projectId: null, name: "2026 촬영", status: "active" },
  workflow: { currentStep: "contract", currentStepName: "계약서", completedSteps: ["quote"], stepStates: [], nextStep: "conti", progressPercent: 29 },
  resources: { quote: { id: "quote-1", approved: true }, contract: null, conti: null, photoProject: null, selectGallery: null, photoGallery: null },
  nextAction: { label: "계약서 작성" }, consistency: { ok: true, issues: [] }, generatedAt: "2026-09-25T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.getSnapshot.mockResolvedValue({ ok: true, value: snapshot });
  dependencies.summarize.mockReturnValue("기통찬의원 · 계약서 단계 · 계약서 없음 · 콘티 없음");
});

describe("project snapshot tools", () => {
  it("uses the active Context project when V2 input omits workflowRunId", async () => {
    const { executeWorkflowTool } = await import("@/lib/olivia/v2/toolExecutors/workflow");
    const result = await executeWorkflowTool("get_project_snapshot", {}, {
      activeProjectId: workflowRunId, recentActions: [], revision: 0,
    });
    expect(dependencies.getSnapshot).toHaveBeenCalledWith(workflowRunId, expect.anything());
    expect(result).toMatchObject({
      success: true,
      data: { summary: "기통찬의원 · 계약서 단계 · 계약서 없음 · 콘티 없음" },
      verification: { executed: true, resourceExists: true },
    });
  });

  it("refuses the V2 read when no project is selected", async () => {
    const { executeWorkflowTool } = await import("@/lib/olivia/v2/toolExecutors/workflow");
    const result = await executeWorkflowTool("get_project_snapshot", {}, { recentActions: [], revision: 0 });
    expect(result).toMatchObject({ success: false, code: "PROJECT_REQUIRED", error: "먼저 프로젝트를 선택해주세요." });
    expect(dependencies.getSnapshot).not.toHaveBeenCalled();
  });

  it("executes Hermes workflow.get_snapshot through the same V2 snapshot tool", async () => {
    const { executeHermesOliviaTool } = await import("@/lib/hermes/mcp/oliviaToolBridge");
    const response = await executeHermesOliviaTool({
      toolName: "workflow.get_snapshot",
      input: { workflowRunId },
    });
    expect(response.isError).not.toBe(true);
    const payload = JSON.parse(response.content[0].text as string);
    expect(payload).toMatchObject({
      success: true,
      data: { summary: "기통찬의원 · 계약서 단계 · 계약서 없음 · 콘티 없음" },
    });
    expect(dependencies.getSnapshot).toHaveBeenCalledWith(workflowRunId, expect.anything());
  });

  it("requires an exact workflowRunId for the Hermes snapshot alias", async () => {
    const { executeHermesOliviaTool } = await import("@/lib/hermes/mcp/oliviaToolBridge");
    const response = await executeHermesOliviaTool({
      toolName: "workflow.get_snapshot",
      input: {},
    });
    expect(response.isError).toBe(true);
    expect(JSON.parse(response.content[0].text as string)).toMatchObject({
      success: false,
      code: "INVALID_TOOL_INPUT",
    });
    expect(dependencies.getSnapshot).not.toHaveBeenCalled();
  });
});
