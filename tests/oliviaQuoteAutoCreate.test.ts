import { beforeEach, describe, expect, it, vi } from "vitest";

// 요청서 시나리오(37번 테스트): "앞으로 견적 요청에 고객이 없으면 자동등록하고 프로젝트도
// 만든 다음 견적서까지 바로 만들어"라는 규칙이 활성화돼 있을 때, create_quote가 실제로
// createClientWithWorkflow를 호출해서 고객/프로젝트를 만들고, 그 clientId가 견적 생성
// 데이터에 실려 가는지 확인한다. 정책이 없을 때는(마이그레이션 미적용 포함) 기존과 완전히
// 같은 동작(자동 생성 없음)을 유지하는지도 함께 확인한다.

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({}) }));

const listActiveMemoriesMock = vi.fn(async (..._args: any[]) => [] as any[]);
vi.mock("@/lib/olivia/memory/repository", () => ({
  listActiveMemories: (...args: any[]) => listActiveMemoriesMock(...args),
  recordMemoryOutcome: vi.fn(async () => {}),
}));

const fuzzyNameSearchMock = vi.fn(async (..._args: any[]) => [] as any[]);
vi.mock("@/lib/olivia/nameSearch", () => ({
  fuzzyNameSearch: (...args: any[]) => fuzzyNameSearchMock(...args),
  fuzzyNameSearchOne: vi.fn(async () => null),
  fuzzyIncludes: (target: unknown, query: unknown) => String(target ?? "").includes(String(query ?? "")),
  normalizeSearchText: (value: unknown) => String(value ?? "").toLowerCase(),
}));

const createClientWithWorkflowMock = vi.fn(async (..._args: any[]) => ({
  client: { id: "new-client-1", hospital_name: "유진스의원" },
  run: { id: "new-run-1" },
  created: true,
}));
vi.mock("@/lib/clients/createClientWithWorkflow", () => ({
  createClientWithWorkflow: (...args: any[]) => createClientWithWorkflowMock(...args),
}));

let lastCrudCall: any = null;
vi.mock("@/lib/olivia/crud/executor", () => ({
  executeOliviaCrud: vi.fn(async (_db: unknown, request: any) => {
    lastCrudCall = request;
    return {
      recordId: "quote-real-1",
      record: { id: "quote-real-1", hospital_name: request.data.hospitalName, total_amount: 1_350_000, client_id: request.data.clientId ?? null, workflow_run_id: request.data.workflowRunId ?? null },
      domain: request.domain,
      operation: request.operation,
      message: "견적서 생성이 완료되었습니다.",
    };
  }),
}));

import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const contextWithoutClient: OliviaContextSnapshot = { recentActions: [], revision: 0 };

function callCreateQuote(hospitalName: string) {
  return executeAgentTool(
    { id: "create-quote-call", name: "create_quote", arguments: JSON.stringify({ hospitalName, packageId: "standard", contactName: null, phone: null, email: null, shootDate: null, profileCount: 0, stagedCount: 0, memo: null }) },
    contextWithoutClient,
  );
}

describe("create_quote — Adaptive Memory Execution Policy", () => {
  beforeEach(() => {
    lastCrudCall = null;
    listActiveMemoriesMock.mockClear();
    fuzzyNameSearchMock.mockClear();
    createClientWithWorkflowMock.mockClear();
  });

  it("규칙이 없으면(정책 없음) 자동 생성 없이 기존과 동일하게 동작한다", async () => {
    listActiveMemoriesMock.mockResolvedValueOnce([]);
    const execution = await callCreateQuote("유진스의원");
    expect(createClientWithWorkflowMock).not.toHaveBeenCalled();
    expect(lastCrudCall.data.clientId).toBeUndefined();
    expect(execution.result.success).toBe(true);
  });

  it("자동등록 규칙이 활성화돼 있고 신규 고객이면 createClientWithWorkflow로 고객+프로젝트를 만들고 견적에 clientId를 싣는다", async () => {
    listActiveMemoriesMock.mockResolvedValueOnce([
      {
        id: "mem-1", memory_type: "business_rule", key: "quote_auto_client_project_creation",
        value: { ifClientMissing: "create_client_from_request", ifProjectMissing: "create_project_from_request" },
        scope: "quote", priority: 100, confidence: 1, source: "seed", source_message_id: null,
        usage_count: 0, success_count: 0, failure_count: 0, is_active: true,
        created_at: "2026-08-24T00:00:00Z", updated_at: "2026-08-24T00:00:00Z",
      },
    ]);
    fuzzyNameSearchMock.mockResolvedValueOnce([]); // 기존 고객 없음 → 신규 생성 경로
    const execution = await callCreateQuote("유진스의원");
    expect(createClientWithWorkflowMock).toHaveBeenCalledTimes(1);
    expect(createClientWithWorkflowMock.mock.calls[0][1]).toMatchObject({ hospitalName: "유진스의원" });
    expect(lastCrudCall.data.clientId).toBe("new-client-1");
    expect(lastCrudCall.data.workflowRunId).toBe("new-run-1");
    expect(execution.result.success).toBe(true);
    // 요청서 4번 — "고객을 먼저 등록해주세요"류 실패 응답이 아니라 실제로 성공해야 한다.
    expect(execution.result.error).toBeUndefined();
  });

  it("비슷한 고객이 2명 이상이면 자동 생성하지 않고 확인을 요청한다(중복 생성 금지)", async () => {
    listActiveMemoriesMock.mockResolvedValueOnce([
      {
        id: "mem-1", memory_type: "business_rule", key: "quote_auto_client_project_creation",
        value: { ifClientMissing: "create_client_from_request" },
        scope: "quote", priority: 100, confidence: 1, source: "seed", source_message_id: null,
        usage_count: 0, success_count: 0, failure_count: 0, is_active: true,
        created_at: "2026-08-24T00:00:00Z", updated_at: "2026-08-24T00:00:00Z",
      },
    ]);
    fuzzyNameSearchMock.mockResolvedValueOnce([
      { id: "client-a", hospital_name: "유진스의원" },
      { id: "client-b", hospital_name: "유진스 의원" },
    ]);
    const execution = await callCreateQuote("유진스의원");
    expect(createClientWithWorkflowMock).not.toHaveBeenCalled();
    expect(execution.result.success).toBe(false);
    expect(execution.result.error).toMatch(/비슷한 고객이/);
  });
});
