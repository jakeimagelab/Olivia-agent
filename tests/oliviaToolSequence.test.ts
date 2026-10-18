import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/olivia/documents/temporaryDocuments", () => ({
  registerTemporaryDocument: vi.fn(async (_db, input: any) => ({ temporaryDocument: { id: `temp-${input.sourceId}`, status: input.clientId ? "linked" : "pending_review", client_id: input.clientId ?? null, workflow_run_id: input.workflowRunId ?? null }, clientResolution: input.clientId ? "existing" : "pending" })),
  findExactDocumentClient: vi.fn(async () => null),
}));
vi.mock("@/lib/clientPortal", () => ({
  ensurePortalAccess: vi.fn(),
  logPortalEvent: vi.fn(async () => ({ id: "event-1" })),
}));

const executionLog: string[] = [];

const quoteRow = {
  id: "quote-real-123",
  quote_number: "PC-123",
  hospital_name: "히어산부인과",
  contact_name: "담당자",
  email: "hello@example.com",
  client_id: "client-1",
  workflow_run_id: "project-1",
  status: "published",
  items: [{ id: "profile_shoot", name: "프로필 촬영", unitPrice: 300_000, qty: 1, subtotal: 300_000 }],
  discount_amount: 0,
  deposit_rate: 50,
};

let contractRow: Record<string, unknown> | null = null;

const contiRow = {
  id: "conti-real-789",
  result: { conti: [{ id: "shot-a", category: "프로필", duration: "10분", location: "", cameraAngle: "", keyword: "원장 프로필", description: "", personnel: "", notes: "" }], checklist: [], schedule: [] },
};

function queryFor(table: string) {
  const currentRow = () => table === "quotes" ? quoteRow
    : table === "contracts" ? contractRow
    : table === "conti_saves" ? contiRow
    : null;
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    eq: vi.fn(() => query),
    insert: vi.fn((payload: Record<string, unknown>) => {
      if (table === "contracts") {
        executionLog.push("db:contract");
        contractRow = { id: "contract-real-456", ...payload };
      }
      return query;
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      executionLog.push(`db:update:${table}`);
      const row = currentRow();
      if (row) Object.assign(row, payload);
      return query;
    }),
    single: vi.fn(async () => ({ data: currentRow(), error: null })),
    maybeSingle: vi.fn(async () => ({ data: currentRow(), error: null })),
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
  currentRequestText: "히어산부인과 견적서\n프로필촬영 35만원",
};

function call(name: string, input: Record<string, unknown>) {
  return executeAgentTool({ id: `${name}-call`, name, arguments: JSON.stringify(input) }, context);
}

describe("Olivia Tool → DB → Result → UI Action", () => {
  beforeEach(() => {
    executionLog.length = 0;
    contractRow = null;
    vi.mocked(executeOliviaCrud).mockClear();
  });

  it("create_quote는 확인 카드만 만들고 승인 후 실제 quoteId로 Workspace를 연다", async () => {
    const prepared = await call("create_quote", { brand: null });
    expect(executionLog).toEqual([]);
    const approval = prepared.uiActions.find((action) => action.type === "REQUEST_APPROVAL");
    if (!approval || approval.type !== "REQUEST_APPROVAL") throw new Error("approval missing");
    const execution = await call(approval.toolName, approval.toolInput);
    expect(executionLog).toEqual(["db:quote"]);
    expect(execution.result).toMatchObject({ success: true, data: { quoteId: "quote-real-123" } });
    expect(execution.uiActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "OPEN_WORKSPACE", workspace: "quote", resourceId: "quote-real-123" }),
    ]));
  });

  it("원문에서 직접 지정한 브랜드가 실제 견적 데이터에 저장된다", async () => {
    const prepared = await executeAgentTool({
      id: "create-quote-brand-context",
      name: "create_quote",
      arguments: JSON.stringify({ brand: null }),
    }, { ...context, currentRequestText: "제이크컴퍼니 견적서\n제품촬영 50만원\n제이크이미지연구소로 만들어줘" });

    const approval = prepared.uiActions.find((action) => action.type === "REQUEST_APPROVAL");
    if (!approval || approval.type !== "REQUEST_APPROVAL") throw new Error("approval missing");
    await executeAgentTool({ id: "apply-quote-brand-context", name: approval.toolName, arguments: JSON.stringify(approval.toolInput) }, { ...context, currentRequestText: "제이크컴퍼니 견적서\n제품촬영 50만원\n제이크이미지연구소로 만들어줘" });
    const createRequest = vi.mocked(executeOliviaCrud).mock.calls.at(-1)?.[1];
    expect(createRequest?.data).toMatchObject({
      title: "제이크컴퍼니 브랜드촬영(제품) 견적서",
      formState: { brand: "jakeimage" },
    });
  });

  it("create_contract는 DB 결과 ID로 Workspace를 연다", async () => {
    const contract = await call("create_contract", { hospitalName: null });

    expect(executionLog).toEqual(["db:contract"]);
    expect(contract.uiActions[0]).toMatchObject({ workspace: "contract", resourceId: "contract-real-456" });
  });

  it("DB Tool 실패 시 UI Action을 만들지 않는다", async () => {
    vi.mocked(executeOliviaCrud).mockRejectedValueOnce(new Error("견적서 생성에 실패했어요."));
    const prepared = await call("create_quote", { brand: null });
    const approval = prepared.uiActions.find((action) => action.type === "REQUEST_APPROVAL");
    if (!approval || approval.type !== "REQUEST_APPROVAL") throw new Error("approval missing");
    const execution = await call(approval.toolName, approval.toolInput);

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

  it("포함 서비스 수정은 새 견적을 만들지 않고 현재 quoteId의 row만 갱신한다", async () => {
    Object.assign(quoteRow, {
      items: [
        { id: "custom:primary", name: "브랜드 촬영", unitPrice: 300_000, qty: 10, subtotal: 3_000_000 },
        { id: "service:profile:0", name: "프로필 촬영 10명 2컷", unitPrice: 0, qty: 1, subtotal: 0 },
      ],
      form_state: {
        pricingMode: "custom_unit",
        includedServices: [{ type: "profile", label: "프로필 촬영", personCount: 10, cutCount: 2 }],
      },
    });
    const execution = await executeAgentTool({
      id: "quote-service-update",
      name: "update_quote_service",
      arguments: JSON.stringify({ selector: "프로필", serviceType: "profile", label: null, personCount: null, cutCount: 3, conceptCount: null, deliverableCount: null, description: null, remove: false }),
    }, { ...context, activeWorkspace: "quote", activeResourceId: quoteRow.id });

    expect(execution.result).toMatchObject({ success: true, data: { quoteId: quoteRow.id, resourceId: quoteRow.id } });
    expect(quoteRow.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "custom:primary", subtotal: 3_000_000 }),
      expect.objectContaining({ id: "service:profile:0", name: "프로필 촬영 10명 3컷", subtotal: 0 }),
    ]));
    expect(executionLog.filter((entry) => entry === "db:quote")).toHaveLength(0);
    expect(executionLog).toContain("db:update:quotes");
  });

});
