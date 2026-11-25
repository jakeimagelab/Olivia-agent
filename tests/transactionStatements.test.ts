import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { quoteDocumentDataFromRow } from "@/lib/quote/quoteDocumentData";
import { buildStatementHtml, buildStatementPage } from "@/lib/quote/transactionStatementHtml";
import { newStatementReceiptToken, statementReceiptTokenHash } from "@/lib/quote/transactionStatementReceipt";
import { buildTransactionStatementSnapshot } from "@/lib/quote/transactionStatementSnapshot";
import { createTransactionStatement, type TransactionStatement } from "@/lib/quote/transactionStatementStore";
import { executeTransactionStatementTool, TRANSACTION_STATEMENT_TOOL } from "@/lib/olivia/v2/toolExecutors/transactionStatement";
import { statementChatRequest, statementChoiceFromHistory } from "@/lib/olivia/v2/transactionStatementIntent";
import * as supabase from "@/lib/supabase";

const QUOTE_ID = "00000000-0000-4000-8000-000000000001";
const STATEMENT_ID = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-11-24T15:10:00.000Z");

function quoteRow(taxMode: "separate" | "included" | "excluded" = "separate") {
  const customItems = [{ id: "work", name: "프로필 촬영", detail: "원장 및 의료진", amount: 244_000, unitPrice: 122_000, quantity: 2 }];
  const benefitItems = [{ id: "bonus", name: "인터뷰 서비스" }];
  const row = {
    id: QUOTE_ID,
    status: "final",
    updated_at: "2026-11-24T13:00:00.000Z",
    quote_number: "PCQ-20261124-1001",
    hospital_name: "테스트치과",
    contact_name: "테스트 담당자",
    email: "test@example.test",
    shoot_date: "2026-12-01",
    items: [
      { name: "프로필 촬영", detail: "원장 및 의료진", qty: 2, unitPrice: 122_000, subtotal: 244_000 },
      { name: "인터뷰 서비스", detail: "대표 소개", qty: 1, unitPrice: 0, subtotal: 0, note: "서비스" },
    ],
    form_state: { brand: "photoclinic", taxMode, customItems, benefitItems, discountRate: 10, extraDiscount: 3_333, fixedTotal: 211_111, roundDownUnit: 1000, depositRate: 30 },
  };
  const doc = quoteDocumentDataFromRow(row);
  return {
    ...row,
    supply_amount: doc.supplyAmount,
    vat: doc.vat,
    total_amount: doc.finalAmount,
    discount_amount: doc.discountTotal,
    deposit_rate: doc.depositRate,
    deposit_amount: doc.depositAmount,
    balance_amount: doc.balanceAmount,
  };
}

function mockDatabase(quote: ReturnType<typeof quoteRow>) {
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: quote, error: null }),
  });
  const rpc = vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: { id: STATEMENT_ID, statement_number: "TS-20261125-01" }, error: null }),
  });
  return { db: { from, rpc } as unknown as SupabaseClient, rpc };
}

describe("거래명세서 전환", () => {
  it("작성 중인 저장 견적서로 거래명세서를 만든다", async () => {
    const { db, rpc } = mockDatabase({ ...quoteRow(), status: "draft" });
    await expect(createTransactionStatement(QUOTE_ID, db, NOW)).resolves.toMatchObject({ id: STATEMENT_ID, status: "draft" });
    expect(rpc).toHaveBeenCalledWith("insert_transaction_statement_from_quote", expect.objectContaining({ source_id: QUOTE_ID }));
  });

  it("저장한 스냅샷의 품목과 금액은 이후 견적 변경과 독립적이다", async () => {
    const quote = quoteRow();
    const { db, rpc } = mockDatabase(quote);
    const result = await createTransactionStatement(QUOTE_ID, db, NOW);
    expect(rpc).toHaveBeenCalledWith("insert_transaction_statement_from_quote", expect.objectContaining({
      statement_date: "2026-11-25", source_version: quote.updated_at, shooting_date: "2026-12-01", statement_snapshot: result.snapshot,
    }));
    const saved = structuredClone(rpc.mock.calls[0][1].statement_snapshot);
    quote.items[0].subtotal = 500;
    quote.total_amount = 550;
    expect(result.snapshot).toEqual(saved);
    expect(saved.document.finalAmount).toBe(232_100);
    expect(saved.lines[0].amount).toBe(244_000);
  });

  it.each(["separate", "included", "excluded"] as const)("%s 세액과 할인·조정·절삭·선금/잔금을 원 단위로 보존한다", (taxMode) => {
    const row = quoteRow(taxMode);
    const source = quoteDocumentDataFromRow(row);
    const snapshot = buildTransactionStatementSnapshot(row);
    expect(snapshot.document).toEqual(source);
    expect(snapshot.lines).toEqual([
      { name: "프로필 촬영", detail: "원장 및 의료진", quantity: 2, unitPrice: 122_000, amount: 244_000, note: "" },
      { name: "인터뷰 서비스", detail: "대표 소개", quantity: 1, unitPrice: 0, amount: 0, note: "서비스" },
    ]);
    expect(source.supplyAmount + source.vat).toBe(source.finalAmount);
    expect(source.depositAmount + source.balanceAmount).toBe(source.finalAmount);
    expect(source.roundDownAmount).toBe(111);
    expect(source.specialAdjustmentAmount).not.toBe(0);
  });

  it("목록 가격이 달라졌어도 저장된 금액과 0원 세액을 우선한다", () => {
    const snapshot = buildTransactionStatementSnapshot({
      ...quoteRow(), supply_amount: "500000", total_amount: "500000", vat: "0",
    });
    expect(snapshot.document).toMatchObject({ supplyAmount: 500_000, finalAmount: 500_000, vat: 0 });
  });

  it("문서에서 빈 업태·종목을 숨기고 직인 2개를 회전 없이 표시한다", () => {
    const statement: TransactionStatement = {
      id: STATEMENT_ID, statement_number: "TS-20261125-01", transaction_date: "2026-11-25",
      shoot_date: "2026-12-01", snapshot: buildTransactionStatementSnapshot(quoteRow()),
      status: "confirmed", pdf_path: null, confirmed_at: "2026-11-25T05:02:00.000Z", confirmed_by: "<담당자>",
    };
    const html = buildStatementHtml(statement, { logo: "logo.png", signature: "sign.png", seal: "seal.png" });
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("업태·종목");
    expect(html).not.toContain("계약 안내");
    expect(html).toContain("본 거래명세서는 견적서 PCQ-20261124-1001의 내용을 그대로 옮겨 작성되었습니다.");
    expect(html.match(/class="seal"/g)).toHaveLength(2);
    expect(html).toContain("rotate(0deg)");
    expect(html).toContain("포털에서 확인됨");
    expect(html).toContain("&lt;담당자&gt;");
    expect(html).toContain("일금 이십삼만이천백원정");
  });

  it("입력 중인 사업자 정보를 다운로드 PDF와 같은 양식으로 그리고 HTML을 이스케이프한다", () => {
    const statement = {
      statement_number: "TS-20261125-01", transaction_date: "2026-11-25", shoot_date: null,
      snapshot: buildTransactionStatementSnapshot(quoteRow()), confirmed_at: null, confirmed_by: null,
      business_details: { supplier: { businessCategory: "서비스", businessItem: "사진 촬영" }, recipient: { name: "<거래처>" } },
    };
    const assets = { logo: "/assets/photoclinic-logo.png" };
    const { sheet } = buildStatementPage(statement, assets);
    expect(sheet).toContain("&lt;거래처&gt;");
    expect(sheet).toContain("서비스 · 사진 촬영");
    expect(buildStatementHtml(statement, assets)).toContain(sheet);
  });

  it("수신확인 토큰은 무작위 값이고 DB 조회는 해시를 사용한다", () => {
    const receipt = newStatementReceiptToken();
    expect(receipt.token).not.toBe(newStatementReceiptToken().token);
    expect(statementReceiptTokenHash(receipt.token)).toBe(receipt.hash);
    expect(statementReceiptTokenHash(STATEMENT_ID)).toBeNull();
  });
});

describe("거래명세서 채팅", () => {
  it("작성 중인 저장 견적을 찾고 거래명세서로 전환한다", async () => {
    const quote = { ...quoteRow(), status: "draft", created_at: NOW.toISOString() };
    const { rpc } = mockDatabase(quote);
    const clientQuery = {
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const quoteQuery = {
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [quote], error: null }),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: quote, error: null }),
    };
    const from = vi.fn((table: string) => table === "clients" ? clientQuery : quoteQuery);
    const admin = vi.spyOn(supabase, "getSupabaseAdmin").mockReturnValue({ from, rpc } as unknown as SupabaseClient);
    try {
      const result = await executeTransactionStatementTool(TRANSACTION_STATEMENT_TOOL, {}, {
        currentRequestText: "테스트치과 거래명세서 만들어줘", recentActions: [], revision: 0,
      });
      expect(result).toMatchObject({ success: true, data: { statementId: STATEMENT_ID } });
      expect(rpc).toHaveBeenCalledWith("insert_transaction_statement_from_quote", expect.objectContaining({ source_id: QUOTE_ID }));
    } finally {
      admin.mockRestore();
    }
  });

  it("원문 고객명만 추출하고 현재 고객을 가리키는 표현으로 전환하지 않는다", () => {
    expect(statementChatRequest("강남스마트치과 거래명세서 만들어줘")).toEqual({ clientName: "강남스마트치과", quoteNumber: null });
    expect(statementChatRequest("이 견적서로 거래명세서 만들어줘")).toEqual({ clientName: "", quoteNumber: null });
    expect(statementChatRequest("강남스마트치과 거래명세서 만들지 마")).toBeNull();
  });

  it("직전 저장된 선택 목록의 견적서 번호만 후속 선택으로 해석한다", () => {
    const history = [{ role: "assistant", metadata: { statementChoice: { clientName: "테스트치과", numbers: ["PCQ-20261124-1001", "PCQ-20261124-1002"] } } }];
    const resolved = statementChoiceFromHistory("PCQ-20261124-1002로 해줘", history);
    expect(statementChatRequest(resolved!)).toEqual({ clientName: "테스트치과", quoteNumber: "PCQ-20261124-1002" });
    expect(statementChoiceFromHistory("PCQ-20261124-1003", history)).toBeNull();
    expect(statementChoiceFromHistory("PCQ-20261124-1002", [...history, { role: "assistant", metadata: {} }])).toBeNull();
  });
});
