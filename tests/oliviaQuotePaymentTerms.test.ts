import { afterEach, describe, expect, it, vi } from "vitest";
import { depositRateOf } from "@/lib/quote/quoteMutationService";

// Olivia OS 채팅/견적서 수정 로직 개선 — TEST 1/2/3/4/7.
// "선금 50%, 잔금 50%를 잔금 100%로 바꿔"류 요청이 update_quote_payment_terms 없이는
// update_quote_note(메모)로 잘못 빠졌다(원인 분석). 이 도구가 실제 DB round-trip 결과로
// 검증하고, form_state.depositRate도 함께 갱신해 화면이 즉시 반영되는지 확인한다.

let quoteRow: Record<string, unknown>;

function queryFor() {
  let updatePatch: Record<string, unknown> | null = null;
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: quoteRow, error: null })),
    update: vi.fn((patch: Record<string, unknown>) => { updatePatch = patch; return query; }),
    single: vi.fn(async () => {
      quoteRow = { ...quoteRow, ...updatePatch };
      return { data: quoteRow, error: null };
    }),
  };
  return query;
}
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => queryFor() }) }));

const { executeAgentTool } = await import("@/lib/olivia/v2/toolExecutor");
const context = { recentActions: [], revision: 0, activeWorkspace: "quote" as const, activeResourceId: "quote-1" };

function baseQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: "quote-1", hospital_name: "연세라이프", items: [{ id: "a", name: "스탠다드", unitPrice: 1_800_000, qty: 1, subtotal: 1_800_000 }],
    discount_amount: 0, deposit_rate: 50, form_state: { depositRate: 50 }, memos: "",
    ...overrides,
  };
}

function callPaymentTerms(input: Record<string, unknown>) {
  return executeAgentTool({ id: "call-1", name: "update_quote_payment_terms", arguments: JSON.stringify(input) }, context);
}

describe("update_quote_payment_terms", () => {
  afterEach(() => vi.restoreAllMocks());

  it("TEST 1 — 잔금 100%(balancePercent)로 바꾸면 deposit=0/balance=100이 실제로 저장된다", async () => {
    quoteRow = baseQuote();
    const execution = await callPaymentTerms({ depositPercent: null, balancePercent: 100 });
    expect(execution.result.success).toBe(true);
    expect(execution.result.data?.depositPercent).toBe(0);
    expect(execution.result.data?.balancePercent).toBe(100);
    expect(execution.result.data?.summary).toBe("결제 조건을 선금 0%, 잔금 100%로 변경했어요.");
    expect(quoteRow.deposit_rate).toBe(0);
    // form_state도 함께 갱신돼야 QuoteBuilder.tsx(useQuoteStore.patchFromAgent)가 즉시 반영한다.
    expect((quoteRow.form_state as Record<string, unknown>).depositRate).toBe(0);
  });

  it("TEST 2 — 선금 없애줘(depositPercent 0)도 동일하게 처리된다", async () => {
    quoteRow = baseQuote();
    const execution = await callPaymentTerms({ depositPercent: 0, balancePercent: null });
    expect(execution.result.data?.depositPercent).toBe(0);
    expect(execution.result.data?.balancePercent).toBe(100);
  });

  it("TEST 3 — 잔금 70%, 선금 30% → depositPercent=30", async () => {
    quoteRow = baseQuote();
    const execution = await callPaymentTerms({ depositPercent: 30, balancePercent: null });
    expect(execution.result.data?.depositPercent).toBe(30);
    expect(execution.result.data?.balancePercent).toBe(70);
    expect(quoteRow.deposit_rate).toBe(30);
  });

  it("범위를 벗어난 값은 실패로 거부한다", async () => {
    quoteRow = baseQuote();
    const execution = await callPaymentTerms({ depositPercent: 150, balancePercent: null });
    expect(execution.result.success).toBe(false);
  });

  it("TEST 4 — update_quote_note는 메모만 바꾸고 deposit_rate는 절대 건드리지 않는다", async () => {
    quoteRow = baseQuote({ deposit_rate: 50 });
    const execution = await executeAgentTool(
      { id: "call-2", name: "update_quote_note", arguments: JSON.stringify({ note: "촬영일 협의" }) },
      context,
    );
    expect(execution.result.success).toBe(true);
    expect(quoteRow.memos).toBe("촬영일 협의");
    expect(quoteRow.deposit_rate).toBe(50);
  });

  it("TEST 7 — deposit_rate=0인 견적서를 다시 읽어도 50으로 되돌아가지 않는다", () => {
    expect(depositRateOf({ deposit_rate: 0 })).toBe(0);
    expect(depositRateOf({ deposit_rate: null })).toBe(50);
    expect(depositRateOf({ deposit_rate: undefined })).toBe(50);
    expect(depositRateOf({ deposit_rate: "0" })).toBe(0);
  });
});
