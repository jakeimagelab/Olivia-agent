import { beforeEach, describe, expect, it, vi } from "vitest";

// PHASE 3(계약서 Chat-native Workflow) 신규 도구 회귀 테스트 — oliviaToolSequence.test.ts의
// queryFor() 체이닝 mock 패턴을 그대로 따른다.

const quoteRow = {
  id: "quote-1",
  quote_number: "PC-1",
  hospital_name: "유진스의원",
  contact_name: "담당자",
  email: "hello@example.com",
  client_id: "client-1",
  workflow_run_id: "project-1",
};

let contractRow: Record<string, any>;

function queryFor(table: string) {
  const row = table === "quotes" ? quoteRow : table === "contracts" ? contractRow : null;
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    eq: vi.fn(() => query),
    update: vi.fn((payload: Record<string, unknown>) => {
      if (row) Object.assign(row, payload);
      return query;
    }),
    single: vi.fn(async () => ({ data: row, error: null })),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  return query;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => queryFor(table) }),
}));

vi.mock("@/lib/olivia/crud/executor", () => ({
  executeOliviaCrud: vi.fn(async (_db: unknown, request: { domain: string; data: Record<string, any> }) => {
    if (request.domain !== "contract") throw new Error("unexpected domain");
    contractRow = {
      id: "contract-1",
      hospital_name: request.data.hospitalName,
      contact_name: request.data.contactName,
      email: request.data.email,
      quote_data: request.data.quoteData,
      client_id: "client-1",
      workflow_run_id: request.data.workflowRunId,
      status: "draft",
      signature_data_url: null,
    };
    return { recordId: "contract-1", record: contractRow, domain: "contract", operation: "create", message: "계약서 생성이 완료되었습니다." };
  }),
}));

import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const baseContext: OliviaContextSnapshot = { recentActions: [], revision: 0 };

function call(name: string, input: Record<string, unknown>, context: OliviaContextSnapshot = baseContext) {
  return executeAgentTool({ id: `${name}-call`, name, arguments: JSON.stringify(input) }, context);
}

describe("create_contract — 견적 우선순위(스펙 §3, §38)", () => {
  it("지금 열려 있는 견적 Workspace를 hospitalName 없이도 우선 사용한다", async () => {
    const execution = await call("create_contract", { hospitalName: null, quoteId: null }, {
      ...baseContext, activeWorkspace: "quote", activeResourceId: "quote-1",
    });
    expect(execution.result.success).toBe(true);
    expect(contractRow.quote_data).toMatchObject({ id: "quote-1", hospital_name: "유진스의원" });
    expect(execution.uiActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "OPEN_WORKSPACE", workspace: "contract", resourceId: "contract-1" }),
      expect.objectContaining({ type: "OPEN_CLIENT_TASK", task: "contract_preview", flowId: "contract-1" }),
    ]));
  });
});

describe("update_contract_terms", () => {
  beforeEach(() => {
    contractRow = { id: "contract-1", hospital_name: "유진스의원", quote_data: { totalAmount: 1_980_000 } };
  });

  it("depositRate가 바뀌면 계약금/잔금을 재계산해 summary에 포함하고 REFRESH_RESOURCE를 만든다", async () => {
    const execution = await call("update_contract_terms", { depositRate: 30, paymentTerms: null, deliveryTerms: null, specialTerms: null }, {
      ...baseContext, activeWorkspace: "contract", activeResourceId: "contract-1",
    });
    expect(execution.result.success).toBe(true);
    expect(contractRow.deposit_rate).toBe(30);
    expect(execution.result.data?.summary).toMatch(/30%/);
    expect(execution.result.data?.summary).toMatch(/594,000원/);
    expect(execution.uiActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "REFRESH_RESOURCE", resource: "contract", resourceId: "contract-1" }),
    ]));
  });

  it("paymentTerms/deliveryTerms/specialTerms만 바뀌어도 각각 저장된다", async () => {
    const execution = await call("update_contract_terms", { depositRate: null, paymentTerms: "촬영 전날", deliveryTerms: "14일", specialTerms: "원본 제공 제외" }, {
      ...baseContext, activeWorkspace: "contract", activeResourceId: "contract-1",
    });
    expect(execution.result.success).toBe(true);
    expect(contractRow.payment_terms).toBe("촬영 전날");
    expect(contractRow.delivery_terms).toBe("14일");
    expect(contractRow.special_terms).toBe("원본 제공 제외");
  });

  it("아무 값도 없으면 실패로 보고한다", async () => {
    const execution = await call("update_contract_terms", { depositRate: null, paymentTerms: null, deliveryTerms: null, specialTerms: null }, {
      ...baseContext, activeWorkspace: "contract", activeResourceId: "contract-1",
    });
    expect(execution.result.success).toBe(false);
  });
});

describe("request_contract_signature / request_contract_publish", () => {
  beforeEach(() => {
    contractRow = { id: "contract-1", hospital_name: "유진스의원", quote_data: { totalAmount: 1_980_000 } };
  });

  it("request_contract_signature는 OPEN_CLIENT_TASK(contract_signature)를 만든다", async () => {
    const execution = await call("request_contract_signature", {}, { ...baseContext, activeWorkspace: "contract", activeResourceId: "contract-1" });
    expect(execution.result.success).toBe(true);
    expect(execution.uiActions).toEqual([{ type: "OPEN_CLIENT_TASK", task: "contract_signature", flowId: "contract-1" }]);
  });

  it("PageContext의 현재 계약서 ID만 있어도 계약서 정보를 조회한다", async () => {
    const execution = await call("request_contract_signature", {}, {
      ...baseContext,
      currentDocumentType: "contract",
      currentDocumentId: "contract-1",
    });
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.contractId).toBe("contract-1");
  });

  it("request_contract_publish는 REQUEST_APPROVAL(publish_contract)을 만든다 — 아직 계약서를 실제로 발행하지 않는다", async () => {
    const execution = await call("request_contract_publish", {}, { ...baseContext, activeWorkspace: "contract", activeResourceId: "contract-1" });
    expect(execution.result.success).toBe(true);
    expect(execution.uiActions[0]).toMatchObject({ type: "REQUEST_APPROVAL", toolName: "publish_contract" });
    expect(contractRow.status).not.toBe("final");
  });
});
