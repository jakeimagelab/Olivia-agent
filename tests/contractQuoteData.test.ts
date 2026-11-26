import { describe, expect, it } from "vitest";
import { buildContractHtml, normalizeContractQuoteData } from "@/lib/contract/contractDocument";
import { contractContentPayload, contractContentUpdate } from "@/lib/contract/contractEdits";

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

  it("서버 PDF용 base URL을 계약서의 상대 에셋 기준으로 사용한다", () => {
    const quote = normalizeContractQuoteData({
      hospital_name: "테스트의원",
      quote_number: "PC-20260925-001",
      items: [],
    }, {});

    expect(quote).not.toBeNull();
    const html = buildContractHtml(quote!, "", "photoclinic", {
      baseUrl: "https://olivia.example.com/",
    });

    expect(html).toContain('<base href="https://olivia.example.com/">');
    expect(html).toContain('src="/assets/photoclinic-logo.png"');
  });

  it("화면에서 수정한 촬영일·결제·납품·특약·본문을 다시 열고 PDF 문구에 사용한다", () => {
    const quote = normalizeContractQuoteData({ hospital_name: "테스트의원", total_amount: 1_000_000 }, {})!;
    const edited = {
      ...quote,
      shootDate: "2026-12-01",
      depositRate: 30,
      paymentTerms: "결과물 확인 후",
      deliveryTerms: "10일",
      specialTerms: "원본 제공 여부는 별도 협의합니다.",
      clauses: { scope: "사진 촬영 2회\n프로필 사진 포함", revisions: "추가 수정 2회 포함" },
    };
    const stored = contractContentUpdate(contractContentPayload(edited));
    expect(stored).toMatchObject({
      deposit_rate: 30,
      payment_terms: "결과물 확인 후",
      delivery_terms: "10일",
      special_terms: "원본 제공 여부는 별도 협의합니다.",
      quote_data: { totalAmount: 1_000_000, clauses: edited.clauses },
    });
    const restored = normalizeContractQuoteData(stored.quote_data, stored)!;
    const html = buildContractHtml(restored);
    expect(html).toContain("촬영 예정일: 2026-12-01");
    expect(html).toContain("계약금 (선금 30%)");
    expect(html).toContain("잔금 700,000원은 결과물 확인 후 납부합니다.");
    expect(html).toContain("10일 이내");
    expect(html).toContain("사진 촬영 2회\n프로필 사진 포함");
    expect(html).toContain("추가 수정 2회 포함");
    expect(html).toContain("원본 제공 여부는 별도 협의합니다.");
    expect(html).toContain("비밀유지 및 결과물 공개");
  });

  it("조항 복원, 0% 선금, 일반 텍스트 렌더링을 지원한다", () => {
    const stored = contractContentUpdate({
      quoteData: { hospitalName: "A & B", clauses: { scope: "", revisions: "사진 <기본> 포함" } },
      depositRate: 0,
      specialTerms: " ",
    });
    expect(stored).toMatchObject({ deposit_rate: 0, special_terms: null, quote_data: { clauses: { revisions: "사진 <기본> 포함" } } });
    const html = buildContractHtml(normalizeContractQuoteData(stored.quote_data, stored)!);
    expect(html).toContain("포토클리닉은 병원 이미지브랜드 구축을 위한,");
    expect(html).toContain("사진 &lt;기본&gt; 포함");
    expect(html).toContain("A &amp; B");
    expect(() => contractContentUpdate({ depositRate: 101 })).toThrow("선금 비율");
  });
});
