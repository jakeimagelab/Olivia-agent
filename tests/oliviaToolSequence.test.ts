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

  it("확정된 PageContext 브랜드가 모델이 보낸 값보다 우선해 실제 견적 데이터에 저장된다", async () => {
    await executeAgentTool({
      id: "create-quote-brand-context",
      name: "create_quote",
      arguments: JSON.stringify({
        brand: "photoclinic",
        hospitalName: "제이크컴퍼니",
        packageId: "standard",
        contactName: null,
        phone: null,
        email: null,
        shootDate: null,
        profileCount: 0,
        stagedCount: 0,
        memo: null,
      }),
    }, { ...context, brand: "jakeimage" });

    const createRequest = vi.mocked(executeOliviaCrud).mock.calls.at(-1)?.[1];
    expect(createRequest?.data).toMatchObject({
      title: "제이크이미지연구소 브랜드사진 견적서",
      formState: { brand: "jakeimage" },
    });
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

  it("견적 기본정보(병원명/제목) 수정은 DB update 후 form_state.customer에도 반영되고 refresh한다", async () => {
    const execution = await executeAgentTool({ id: "quote-info-update", name: "update_quote_info", arguments: JSON.stringify({ hospitalName: "새이름산부인과", contactName: null, phone: null, email: null, quoteDate: null, shootDate: null, validUntil: null, quoteTitle: "여름 프로모션 견적서" }) }, {
      ...context, activeWorkspace: "quote", activeResourceId: quoteRow.id,
    });
    expect(executionLog).toContain("db:update:quotes");
    expect(quoteRow).toMatchObject({ hospital_name: "새이름산부인과", title: "여름 프로모션 견적서" });
    expect((quoteRow as unknown as { form_state: { customer: { hospitalName: string } } }).form_state.customer).toMatchObject({ hospitalName: "새이름산부인과" });
    expect(execution.uiActions[0]).toMatchObject({ type: "REFRESH_RESOURCE", resource: "quote", resourceId: quoteRow.id });
  });

  it("견적 기본정보 수정에 변경할 값이 하나도 없으면 실패로 보고한다", async () => {
    const execution = await executeAgentTool({ id: "quote-info-empty", name: "update_quote_info", arguments: JSON.stringify({ hospitalName: null, contactName: null, phone: null, email: null, quoteDate: null, shootDate: null, validUntil: null, quoteTitle: null }) }, {
      ...context, activeWorkspace: "quote", activeResourceId: quoteRow.id,
    });
    expect(execution.result.success).toBe(false);
  });

  it("콘티 컷 추가는 같은 result JSON을 저장한 뒤 refresh한다", async () => {
    const execution = await executeAgentTool({ id: "conti-add", name: "add_conti_shots", arguments: JSON.stringify({ items: [{ category: "상담", keyword: null, personnel: null, location: null, description: null, notes: null }, { category: "상담", keyword: null, personnel: null, location: null, description: null, notes: null }], insertAfter: null }) }, {
      ...context, activeWorkspace: "conti", activeResourceId: contiRow.id,
    });
    expect(executionLog).toContain("db:update:conti_saves");
    expect(contiRow.result.conti).toHaveLength(3);
    expect(execution.uiActions[0]).toMatchObject({ type: "REFRESH_RESOURCE", resource: "conti", resourceId: contiRow.id });
  });
});

// 코드 요청서(2026-08-15) 3·4번 항목 — create_feature_record/update_feature_record는 열린 7개
// 도메인만 실행하고, 나머지(quote/contract/client/workflow 등)는 executeOliviaCrud를 아예 안 부르고
// 막는다. owner_only 필드는 열린 7개 도메인 어디에도 없어서(전부 client/quote/contract 전용) 이
// 단계에서는 review_required 즉시 실행 경로만 실제로 도달 가능 — owner_only 분기 자체는
// tests/olivia/crudValidation.test.ts가 validateOliviaCrudRequest 단에서 이미 검증한다.
describe("Olivia 범용 기능 생성/수정 도구", () => {
  beforeEach(() => {
    executionLog.length = 0;
    vi.mocked(executeOliviaCrud).mockClear();
  });

  it("열린 도메인(memo)은 즉시 실행되고 검토 안내 문구가 붙는다", async () => {
    const execution = await call("create_feature_record", {
      domain: "memo",
      data: JSON.stringify({ rawMemo: "고객이 따뜻한 톤을 원함" }),
      requestText: null,
    });
    expect(executionLog).toEqual(["db:memo"]);
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.summary).toMatch(/검토가 필요한 변경입니다/);
  });

  it("아직 열지 않은 도메인(quote)은 executeOliviaCrud를 부르지 않고 막는다", async () => {
    const execution = await call("update_feature_record", {
      domain: "quote",
      data: JSON.stringify({ totalAmount: 1_000_000 }),
      target: "PC-123",
      requestText: null,
    });
    expect(executionLog).toEqual([]);
    expect(execution.result.success).toBe(false);
    expect(execution.result.error).toMatch(/아직 챗에서/);
  });

  it("data가 JSON이 아니면 실행 전에 막는다", async () => {
    const execution = await call("create_feature_record", { domain: "memo", data: "이거 JSON 아님", requestText: null });
    expect(executionLog).toEqual([]);
    expect(execution.result.success).toBe(false);
  });

  it("update는 target이 없으면 대상을 찾기 전에 막는다", async () => {
    const execution = await call("update_feature_record", { domain: "calendar", data: JSON.stringify({ title: "촬영" }), target: "", requestText: null });
    expect(executionLog).toEqual([]);
    expect(execution.result.success).toBe(false);
  });

  it("apply_feature_record_write는 승인 카드의 toolInput을 그대로 재생해서 실행한다", async () => {
    const execution = await call("apply_feature_record_write", {
      operation: "create",
      domain: "agent_task",
      crudData: { title: "테스트 업무" },
      target: undefined,
    });
    expect(executionLog).toEqual(["db:agent_task"]);
    expect(execution.result.success).toBe(true);
  });
});
