import { describe, expect, it } from "vitest";
import { normalizeContractQuoteData } from "@/lib/contract/contractDocument";

describe("contract quote data", () => {
  it("canonical 견적 row의 항목과 금액을 계약서 데이터로 보존한다", () => {
    const row = {
      hospital_name: "테스트의원",
      contact_name: "담당자",
      quote_number: "PC-20260924-001",
      quote_date: "2026-09-24",
      shoot_date: "2026-10-02",
      valid_until: "2026-10-08",
      items: [{ name: "브랜드 촬영", detail: "연출 촬영", unit_price: 1_000_000, quantity: 1, subtotal: 1_000_000, note: "촬영" }],
      supply_amount: 1_000_000,
      vat: 100_000,
      total_amount: 1_100_000,
      deposit_amount: 550_000,
      balance_amount: 550_000,
      deposit_rate: 50,
    };

    expect(normalizeContractQuoteData(row, row)).toMatchObject({
      hospitalName: "테스트의원",
      contactName: "담당자",
      totalAmount: 1_100_000,
      depositRate: 50,
      items: [{ name: "브랜드 촬영", detail: "연출 촬영", unitPrice: 1_000_000, qty: 1, subtotal: 1_000_000 }],
    });
  });
});
