import { beforeEach, describe, expect, it, vi } from "vitest";

// Agent 실행 구조 개편(2026-08-31) — toolExecutor.ts를 domain executor로 쪼개고
// OliviaToolResult에 verification을 추가한 작업의 회귀 테스트. "실행했다고 생각함"이 아니라
// "실제 결과를 확인함"을 검증한다(스펙 §29 A-E) — 실제 DB round-trip이 성공/실패했을 때
// verification 필드가 진짜 상태를 반영하는지, 그리고 verification이 없는 기존 legacy tool도
// 여전히 정상 동작하는지를 함께 본다.

const quoteRow: Record<string, unknown> = {
  id: "quote-1",
  hospital_name: "유진스의원",
  quote_number: "Q-1",
  items: [{ id: "item-1", name: "기본형", unitPrice: 100000, qty: 1, subtotal: 100000, detail: "", note: "" }],
  form_state: {},
  total_amount: 100000,
  discount_amount: 0,
  client_id: null,
};

let quoteUpdateResult: { data: Record<string, unknown> | null; error: { message: string } | null } = {
  data: { ...quoteRow, total_amount: 200000 },
  error: null,
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "quotes") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: quoteRow, error: null }) }) }),
          update: () => ({ eq: () => ({ select: () => ({ single: async () => quoteUpdateResult }) }) }),
        };
      }
      throw new Error(`unexpected table in test mock: ${table}`);
    },
  }),
}));

const fuzzyNameSearchMock = vi.fn(async (..._args: any[]) => [] as any[]);
vi.mock("@/lib/olivia/nameSearch", () => ({
  fuzzyNameSearch: (...args: any[]) => fuzzyNameSearchMock(...args),
  fuzzyNameSearchOne: vi.fn(async () => null),
  fuzzyIncludes: (target: unknown, query: unknown) => String(target ?? "").includes(String(query ?? "")),
  normalizeSearchText: (value: unknown) => String(value ?? "").toLowerCase(),
  normalizeHospitalNameLoose: (value: unknown) => String(value ?? "").toLowerCase(),
}));

vi.mock("@/lib/olivia/memory/repository", () => ({
  listActiveMemories: vi.fn(async () => [] as any[]),
  recordMemoryOutcome: vi.fn(async () => {}),
}));

vi.mock("@/lib/clients/createClientWithWorkflow", () => ({
  createClientWithWorkflow: vi.fn(async () => ({ client: { id: "new-client-1", hospital_name: "유진스의원" }, run: { id: "new-run-1" }, created: true })),
}));

vi.mock("@/lib/olivia/crud/executor", () => ({
  executeOliviaCrud: vi.fn(async (_db: unknown, request: any) => {
    if (request.domain === "quote") {
      return {
        recordId: "quote-real-1",
        record: { id: "quote-real-1", hospital_name: request.data.hospitalName, total_amount: 1_350_000, client_id: request.data.clientId ?? null, workflow_run_id: request.data.workflowRunId ?? null },
        domain: request.domain, operation: request.operation, message: "견적서 생성이 완료되었습니다.",
      };
    }
    if (request.domain === "contract") {
      return {
        recordId: "contract-real-1",
        record: { id: "contract-real-1", hospital_name: request.data.hospitalName, client_id: null, workflow_run_id: null },
        domain: request.domain, operation: request.operation, message: "계약서 생성이 완료되었습니다.",
      };
    }
    throw new Error(`unexpected domain in test mock: ${request.domain}`);
  }),
}));

const linkDocumentToClientMock = vi.fn(async (..._args: any[]) => ({ action: "done", message: "못 찾았어요" }) as Record<string, unknown>);
vi.mock("@/lib/olivia/tools/documentLink", () => ({
  linkDocumentToClient: (...args: any[]) => linkDocumentToClientMock(...args),
}));

vi.mock("@/lib/olivia/tools/calendar", () => ({
  listCalendarTasks: vi.fn(async () => [] as any[]),
  addCalendarTask: vi.fn(async () => "task-1"),
  updateCalendarTask: vi.fn(async () => {}),
  deleteCalendarTask: vi.fn(async () => {}),
  resolveCalendarTaskId: vi.fn(async () => "task-1"),
}));

import { executeAgentTool } from "@/lib/olivia/v2/toolExecutor";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";

const baseContext: OliviaContextSnapshot = { recentActions: [], revision: 0 };
const quoteWorkspaceContext: OliviaContextSnapshot = { ...baseContext, activeWorkspace: "quote", activeResourceId: "quote-1" };

function call(name: string, input: Record<string, unknown>, context: OliviaContextSnapshot = baseContext) {
  return executeAgentTool({ id: `${name}-call`, name, arguments: JSON.stringify(input) }, context);
}

describe("Tool 실행 결과 Verification (Agent 실행 구조 개편, 2026-08-31)", () => {
  beforeEach(() => {
    fuzzyNameSearchMock.mockReset().mockResolvedValue([]);
    linkDocumentToClientMock.mockReset().mockResolvedValue({ action: "done", message: "못 찾았어요" });
    quoteUpdateResult = { data: { ...quoteRow, total_amount: 200000 }, error: null };
  });

  it("A. create_quote 성공 시 verification.persisted/resourceExists가 실제 DB round-trip 결과를 반영한다", async () => {
    const execution = await call("create_quote", {
      hospitalName: "유진스의원", packageId: "standard", contactName: null, phone: null, email: null,
      shootDate: null, profileCount: null, stagedCount: null, memo: null, brand: null,
    });
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.quoteId).toBe("quote-real-1");
    expect(execution.result.verification?.persisted).toBe(true);
    expect(execution.result.verification?.resourceExists).toBe(true);
  });

  it("A-2. 의료 문맥으로 확정된 Context 브랜드는 견적 마법사 카드 초기값으로 전달된다", async () => {
    const execution = await call("start_quote_wizard", {}, { ...baseContext, brand: "photoclinic" });
    expect(execution.result).toMatchObject({ success: true, data: { brand: "photoclinic" } });
    expect(execution.uiActions).toEqual([
      expect.objectContaining({
        type: "OPEN_CLIENT_TASK",
        task: "quote_wizard",
        initialData: { brand: "photoclinic" },
      }),
    ]);
  });

  it("A-3. 브랜드가 확정되지 않은 견적 마법사는 기존 선택 UI를 유지한다", async () => {
    const execution = await call("start_quote_wizard", {});
    expect(execution.result.data?.brand).toBeUndefined();
    expect(execution.uiActions[0]).toMatchObject({ type: "OPEN_CLIENT_TASK", task: "quote_wizard" });
    expect(execution.uiActions[0]).not.toHaveProperty("initialData");
  });

  it("B. get_conti_status — 저장된 콘티가 없으면 success=true인데도 verification.resourceExists=false다(콘티 없음은 실패가 아니다)", async () => {
    fuzzyNameSearchMock.mockResolvedValueOnce([]);
    const execution = await call("get_conti_status", { hospitalName: "없는병원" });
    expect(execution.result.success).toBe(true);
    expect(execution.result.verification?.executed).toBe(true);
    expect(execution.result.verification?.resourceExists).toBe(false);
  });

  it("B-2. get_conti_status — 콘티를 찾으면 verification.resourceExists=true다", async () => {
    fuzzyNameSearchMock.mockResolvedValueOnce([{ id: "conti-1", hospital_name: "유진스의원", saved_at: "2026-08-20", result: { conti: [], checklist: [] } }]);
    const execution = await call("get_conti_status", { hospitalName: "유진스의원" });
    expect(execution.result.success).toBe(true);
    expect(execution.result.verification?.resourceExists).toBe(true);
  });

  it("C. link_document_to_client — 연결 대상을 못 찾으면 기존 success 메시지는 유지하되 verification.linked=false로 실패를 숨기지 않는다", async () => {
    linkDocumentToClientMock.mockResolvedValueOnce({ action: "done", message: "일치하는 자료를 못 찾았어요." });
    const execution = await call("link_document_to_client", { documentType: "conti", documentQuery: "없는병원", clientName: "아무의원" });
    expect(execution.result.success).toBe(true);
    expect(execution.result.verification?.linked).toBe(false);
  });

  it("C-2. link_document_to_client — 실제로 연결되면 verification.linked=true다", async () => {
    linkDocumentToClientMock.mockResolvedValueOnce({ action: "done", message: "연결했어요", documentId: "doc-1", clientName: "유진스의원" });
    const execution = await call("link_document_to_client", { documentType: "conti", documentQuery: "유진스의원", clientName: "유진스의원" });
    expect(execution.result.success).toBe(true);
    expect(execution.result.verification?.linked).toBe(true);
    expect(execution.result.verification?.persisted).toBe(true);
  });

  it("D. DB update가 실패하면 success=false이고 verification.persisted는 true가 아니다(LLM이 계산한 값을 믿지 않는다)", async () => {
    quoteUpdateResult = { data: null, error: { message: "DB 오류" } };
    const execution = await call(
      "update_quote_item",
      { selector: "기본형", position: null, amount: 200000, quantity: null, description: null, note: null },
      quoteWorkspaceContext,
    );
    expect(execution.result.success).toBe(false);
    expect(execution.result.verification?.persisted).not.toBe(true);
    expect(execution.result.verification?.executed).toBe(false);
  });

  it("E. verification이 없는 기존 legacy 결과(calendar_list)도 정상 동작한다 — 새 필드가 optional이라 하위호환된다", async () => {
    const execution = await call("calendar_list", { date: "2026-09-01" });
    expect(execution.result.success).toBe(true);
    expect(execution.result.verification).toBeUndefined();
  });
});

describe("Tool Dispatch — 이름→domain executor 연결이 분리 후에도 그대로다(구조 개편 §30)", () => {
  beforeEach(() => {
    fuzzyNameSearchMock.mockReset().mockResolvedValue([]);
  });

  it('"create_quote"는 quote executor로 라우팅된다(quoteId/totalAmount를 반환)', async () => {
    const execution = await call("create_quote", {
      hospitalName: "유진스의원", packageId: "standard", contactName: null, phone: null, email: null,
      shootDate: null, profileCount: null, stagedCount: null, memo: null, brand: null,
    });
    expect(execution.result.data?.quoteId).toBe("quote-real-1");
    expect(execution.result.data?.totalAmount).toBe(1_350_000);
  });

  it('"create_contract"는 contract executor로 라우팅된다(contractId를 반환)', async () => {
    const execution = await call("create_contract", { hospitalName: null, quoteId: "quote-1" });
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.contractId).toBe("contract-real-1");
  });

  it('"calendar_add"는 calendar executor로 라우팅된다(taskId를 반환)', async () => {
    const execution = await call("calendar_add", { date: "2026-09-01", title: "미팅", time: null, location: null, memo: null, category: null });
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.taskId).toBe("task-1");
  });

  it('"send_mailing"은 mailing executor로 라우팅된다(mailingId/approvalRequired를 반환)', async () => {
    const execution = await call("send_mailing", { mailingId: "mail-1" });
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.mailingId).toBe("mail-1");
    expect(execution.result.data?.approvalRequired).toBe(true);
  });
});
