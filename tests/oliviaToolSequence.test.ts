import { beforeEach, describe, expect, it, vi } from "vitest";

const executionLog: string[] = [];

const quoteRow = {
  id: "quote-real-123",
  quote_number: "PC-123",
  hospital_name: "히어산부인과",
  contact_name: "담당자",
  email: "hello@example.com",
  client_id: "client-1",
  workflow_run_id: "project-1",
  items: [{ id: "profile_shoot", name: "프로필 촬영", unitPrice: 300_000, qty: 1, subtotal: 300_000 }],
  discount_amount: 0,
  deposit_rate: 50,
};

const contiRow = {
  id: "conti-real-789",
  result: { conti: [{ id: "shot-a", category: "프로필", duration: "10분", location: "", cameraAngle: "", keyword: "원장 프로필", description: "", personnel: "", notes: "" }], checklist: [], schedule: [] },
};

function queryFor(table: string) {
  const row = table === "quotes" ? quoteRow : table === "conti_saves" ? contiRow : null;
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    eq: vi.fn(() => query),
    update: vi.fn((payload: Record<string, unknown>) => {
      executionLog.push(`db:update:${table}`);
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
  executeOliviaCrud: vi.fn(async (_db: unknown, request: { domain: string; operation: string }) => {
    executionLog.push(`db:${request.domain}`);
    if (request.domain === "quote") {
      return { recordId: "quote-real-123", record: quoteRow, domain: request.domain, operation: request.operation, message: "견적서 생성이 완료되었습니다." };
    }
    if (request.domain === "contract") {
      return {
        recordId: "contract-real-456",
        record: { id: "contract-real-456", hospital_name: "히어산부인과", client_id: "client-1" },
        domain: request.domain,
        operation: request.operation,
        message: "계약서 생성이 완료되었습니다.",
      };
    }
    if (request.domain === "conti") {
      return {
        recordId: "conti-real-789",
        record: { id: "conti-real-789", hospital_name: "히어산부인과" },
        domain: request.domain,
        operation: request.operation,
        message: "콘티 생성이 완료되었습니다.",
      };
    }
    return {
      recordId: "record-real-999",
      record: { id: "record-real-999" },
      domain: request.domain,
      operation: request.operation,
      message: `${request.domain} ${request.operation === "create" ? "생성" : "수정"}이 완료되었습니다.`,
    };
  }),
}));

import { executeOliviaCrud } from "@/lib/olivia/crud/executor";
import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const context: OliviaContextSnapshot = {
  activeClientId: "client-1",
  activeClientName: "히어산부인과",
  activeProjectId: "project-1",
  activeProjectName: "브랜드 촬영",
  recentActions: [],
  revision: 1,
};

function call(name: string, input: Record<string, unknown>) {
  return executeAgentTool({ id: `${name}-call`, name, arguments: JSON.stringify(input) }, context);
}

describe("Olivia Tool → DB → Result → UI Action", () => {
  beforeEach(() => {
    executionLog.length = 0;
    vi.mocked(executeOliviaCrud).mockClear();
  });

  it("create_quote DB 결과의 실제 quoteId로만 Workspace를 연다", async () => {
    const execution = await call("create_quote", {
      hospitalName: "히어산부인과",
      packageId: "standard",
      contactName: null,
      phone: null,
      email: null,
      shootDate: null,
      profileCount: 1,
      stagedCount: 0,
      memo: null,
    });

    expect(executionLog).toEqual(["db:quote"]);
    expect(execution.result).toMatchObject({ success: true, data: { quoteId: "quote-real-123" } });
    expect(execution.uiActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "OPEN_WORKSPACE", workspace: "quote", resourceId: "quote-real-123" }),
    ]));
  });

  it("create_contract와 create_conti도 DB 결과 ID로 Workspace를 연다", async () => {
    const contract = await call("create_contract", { hospitalName: null });
    const conti = await call("create_conti", { hospitalName: null, title: null, specialties: [] });

    expect(executionLog).toEqual(["db:contract", "db:conti"]);
    expect(contract.uiActions[0]).toMatchObject({ workspace: "contract", resourceId: "contract-real-456" });
    expect(conti.uiActions[0]).toMatchObject({ workspace: "conti", resourceId: "conti-real-789" });
  });

  it("DB Tool 실패 시 UI Action을 만들지 않는다", async () => {
    vi.mocked(executeOliviaCrud).mockRejectedValueOnce(new Error("견적서 생성에 실패했어요."));
    const execution = await call("create_quote", {
      hospitalName: "히어산부인과",
      packageId: "standard",
      contactName: null,
      phone: null,
      email: null,
      shootDate: null,
      profileCount: 0,
      stagedCount: 0,
      memo: null,
    });

    expect(execution.result.success).toBe(false);
    expect(execution.uiActions).toEqual([]);
  });

  it("견적 가격 수정은 DB update 후 실제 resource refresh를 만든다", async () => {
    const execution = await executeAgentTool({ id: "quote-update", name: "update_quote_item", arguments: JSON.stringify({ selector: "프로필", amount: "50만원", quantity: null, description: null, note: null }) }, {
      ...context, activeWorkspace: "quote", activeResourceId: quoteRow.id,
    });
    expect(executionLog).toContain("db:update:quotes");
    expect(quoteRow.items[0]).toMatchObject({ unitPrice: 500_000, subtotal: 500_000 });
    expect(execution.uiActions[0]).toMatchObject({ type: "REFRESH_RESOURCE", resource: "quote", resourceId: quoteRow.id });
  });

  it("콘티 컷 추가는 같은 result JSON을 저장한 뒤 refresh한다", async () => {
    const execution = await executeAgentTool({ id: "conti-add", name: "add_conti_shots", arguments: JSON.stringify({ count: "두 개", shotType: "상담", description: null }) }, {
      ...context, activeWorkspace: "conti", activeResourceId: contiRow.id,
    });
    expect(executionLog).toContain("db:update:conti_saves");
    expect(contiRow.result.conti).toHaveLength(3);
    expect(execution.uiActions[0]).toMatchObject({ type: "REFRESH_RESOURCE", resource: "conti", resourceId: contiRow.id });
  });
});
