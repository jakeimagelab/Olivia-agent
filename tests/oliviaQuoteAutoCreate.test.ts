import { beforeEach, describe, expect, it, vi } from "vitest";

const idempotencyMocks = vi.hoisted(() => ({
  findRecent: vi.fn(async () => null as Record<string, unknown> | null),
}));

vi.mock("@/lib/quote/quoteCreateIdempotency", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/quote/quoteCreateIdempotency")>(),
  findRecentQuoteByCreateRequestKey: idempotencyMocks.findRecent,
}));

vi.mock("@/lib/olivia/documents/temporaryDocuments", () => ({
  registerTemporaryDocument: vi.fn(async (_db, input: any) => ({ temporaryDocument: { id: `temp-${input.sourceId}`, status: input.clientId ? "linked" : "pending_review", client_id: input.clientId ?? null, workflow_run_id: input.workflowRunId ?? null }, clientResolution: input.clientId ? "existing" : "pending" })),
  findExactDocumentClient: vi.fn(async () => null),
}));

// 임시문서함 정책: 과거 adaptive memory에 고객 자동등록 규칙이 남아 있어도 신규 고객은
// 문서 내용 승인 전에는 생성하지 않는다. create_quote는 원본 초안만 만들고 공통 임시문서
// 등록기가 기존 고객 정확 일치 여부를 결정한다.

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({}) }));

const listActiveMemoriesMock = vi.fn(async () => [] as any[]);
vi.mock("@/lib/olivia/memory/repository", () => ({
  listActiveMemories: () => listActiveMemoriesMock(),
  recordMemoryOutcome: vi.fn(async () => {}),
}));

const fuzzyNameSearchMock = vi.fn(async () => [] as any[]);
vi.mock("@/lib/olivia/nameSearch", () => ({
  fuzzyNameSearch: () => fuzzyNameSearchMock(),
  fuzzyNameSearchOne: vi.fn(async () => null),
  fuzzyIncludes: (target: unknown, query: unknown) => String(target ?? "").includes(String(query ?? "")),
  normalizeSearchText: (value: unknown) => String(value ?? "").toLowerCase(),
}));

const createClientWithWorkflowMock = vi.fn(async () => ({
  client: { id: "new-client-1", hospital_name: "유진스의원" },
  run: { id: "new-run-1" },
  created: true,
}));
vi.mock("@/lib/clients/createClientWithWorkflow", () => ({
  createClientWithWorkflow: () => createClientWithWorkflowMock(),
}));

let lastCrudCall: any = null;
let crudCallCount = 0;
vi.mock("@/lib/olivia/crud/executor", () => ({
  executeOliviaCrud: vi.fn(async (_db: unknown, request: any) => {
    crudCallCount += 1;
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

function callCreateQuote(hospitalName: string, context: OliviaContextSnapshot = contextWithoutClient) {
  return executeAgentTool(
    { id: "create-quote-call", name: "create_quote", arguments: JSON.stringify({ brand: null }) },
    { ...context, currentRequestText: context.currentRequestText ?? `${hospitalName} 견적서\n프로필촬영 35만원` },
  );
}

describe("create_quote — temporary document client approval policy", () => {
  beforeEach(() => {
    lastCrudCall = null;
    crudCallCount = 0;
    idempotencyMocks.findRecent.mockReset().mockResolvedValue(null);
    listActiveMemoriesMock.mockClear();
    fuzzyNameSearchMock.mockClear();
    createClientWithWorkflowMock.mockClear();
  });

  it("규칙이 없으면 신규 고객을 만들지 않고 임시문서로 저장한다", async () => {
    listActiveMemoriesMock.mockResolvedValueOnce([]);
    const execution = await callCreateQuote("유진스의원");
    expect(createClientWithWorkflowMock).not.toHaveBeenCalled();
    expect(lastCrudCall.data.clientId).toBeUndefined();
    expect(execution.result.success).toBe(true);
  });

  it("과거 자동등록 규칙이 있어도 승인 전에는 고객과 프로젝트를 만들지 않는다", async () => {
    listActiveMemoriesMock.mockResolvedValueOnce([
      {
        id: "mem-1", memory_type: "business_rule", key: "quote_auto_client_project_creation",
        value: { ifClientMissing: "create_client_from_request", ifProjectMissing: "create_project_from_request" },
        scope: "quote", priority: 100, confidence: 1, source: "seed", source_message_id: null,
        usage_count: 0, success_count: 0, failure_count: 0, is_active: true,
        created_at: "2026-08-24T00:00:00Z", updated_at: "2026-08-24T00:00:00Z",
      },
    ]);
    const execution = await callCreateQuote("유진스의원");
    expect(createClientWithWorkflowMock).not.toHaveBeenCalled();
    expect(lastCrudCall.data.clientId).toBeUndefined();
    expect(lastCrudCall.data.workflowRunId).toBeUndefined();
    expect(execution.result.success).toBe(true);
    expect(execution.result.data).toMatchObject({ temporaryDocumentStatus: "pending_review" });
  });

  it("비슷한 고객 후보가 있어도 fuzzy 매칭으로 선연결하지 않는다", async () => {
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
    expect(fuzzyNameSearchMock).not.toHaveBeenCalled();
    expect(execution.result.success).toBe(true);
    expect(lastCrudCall.data.clientId).toBeUndefined();
  });

  it("행사명에 들어간 치과라는 글자만으로 포토클리닉 고객으로 고쳐 읽지 않는다", async () => {
    const execution = await callCreateQuote("예방치과교실 60주년 행사", {
      ...contextWithoutClient,
      activeClientName: "화면에 열린 다른 병원",
      currentRequestText: "예방치과교실 60주년 행사",
    });
    expect(execution.result.success).toBe(true);
    expect(lastCrudCall.data).toMatchObject({
      hospitalName: "예방치과교실 60주년 행사",
      title: "예방치과교실 60주년 행사 견적서",
      formState: { brand: "jakeimage" },
    });
    expect(lastCrudCall.data.clientId).toBeUndefined();
    expect(createClientWithWorkflowMock).not.toHaveBeenCalled();
  });

  it("같은 대화의 동일 견적 재전송은 기존 견적을 반환하고 새 행을 만들지 않는다", async () => {
    const context: OliviaContextSnapshot = {
      recentActions: [],
      revision: 0,
      currentConversationId: "conversation-1",
      currentRequestText: "1989 청담스시\n견적서 만들어줘\n음식사진촬영 150만원",
    };
    const first = await callCreateQuote("1989 청담스시", context);
    const requestKey = lastCrudCall.data.formState.oliviaCreateRequestKey;
    expect(first.result.success).toBe(true);
    expect(requestKey).toMatch(/^[0-9a-f]{64}$/);
    expect(crudCallCount).toBe(1);

    idempotencyMocks.findRecent.mockResolvedValueOnce({
      id: "quote-real-1",
      hospital_name: "1989 청담스시",
      title: "1989 청담스시 사진촬영 견적서",
      total_amount: 1_350_000,
      form_state: { oliviaCreateRequestKey: requestKey },
    });
    const retry = await callCreateQuote("1989 청담스시", context);

    expect(crudCallCount).toBe(1);
    expect(retry.result).toMatchObject({
      success: true,
      data: { quoteId: "quote-real-1", deduplicated: true },
      verification: { persisted: true, resourceExists: true, details: { deduplicated: true } },
    });
  });
});
