import { describe, expect, it } from "vitest";
import {
  buildAgentQuoteData,
  formatIncludedService,
  resolveQuotePricingMode,
} from "@/lib/quote/agentQuote";
import {
  buildTelegramQuoteSummary,
  formatTelegramQuoteSummary,
} from "@/lib/quote/telegramQuoteSummary";

function customInput(overrides: Record<string, unknown> = {}) {
  return {
    brand: "photoclinic",
    hospitalName: "BGN성형외과",
    title: "BGN 브랜딩 촬영 견적서",
    pricingMode: "custom_unit",
    packageId: null,
    customQuantity: 10,
    customUnitPrice: "30만원",
    customTotalPrice: null,
    unitLabel: "명",
    contactName: null,
    phone: null,
    email: null,
    shootDate: null,
    profileCount: 0,
    stagedCount: 0,
    discountRate: null,
    discountAmount: null,
    extraItems: [],
    serviceItems: [],
    includedServices: [],
    memo: null,
    ...overrides,
  };
}

describe("Natural Language Quote V2 — TEST A~K", () => {
  it("TEST A. 원문에 패키지가 없으면 잘못 전달된 packageId를 무시한다", () => {
    expect(resolveQuotePricingMode(customInput({ pricingMode: "package", packageId: "standard" }), "BGN 10명 인당 30만원 견적"))
      .toBe("custom_unit");
  });

  it("TEST B. BGN 인원×단가를 하나의 CUSTOM 주 가격 행으로 만든다", () => {
    const quote = buildAgentQuoteData(customInput(), undefined, "BGN 10명 인당 30만원 견적 만들어줘");
    expect(quote.items[0]).toMatchObject({ id: "custom:primary", unitPrice: 300_000, qty: 10, subtotal: 3_000_000 });
    expect(quote.totalAmount).toBe(3_000_000);
    expect(quote.formState).toMatchObject({ pricingMode: "custom_unit", agentOverrideItems: true, selectedPackageId: null });
  });

  it("TEST C. 명시 총액은 CUSTOM_TOTAL 한 행으로 보존한다", () => {
    const quote = buildAgentQuoteData(customInput({ pricingMode: "custom_total", customQuantity: null, customUnitPrice: null, customTotalPrice: "275만원" }), undefined, "BGN 총액 275만원 견적");
    expect(quote.items[0]).toMatchObject({ id: "custom:primary", qty: 1, subtotal: 2_750_000 });
    expect(quote.totalAmount).toBe(2_750_000);
  });

  it("TEST D. 패키지라는 원문과 정확한 packageId가 함께 있을 때만 카탈로그를 쓴다", () => {
    const quote = buildAgentQuoteData(customInput({ pricingMode: "package", packageId: "premium", customQuantity: null, customUnitPrice: null }), undefined, "BGN 프리미엄 패키지 견적");
    expect(quote.items[0]).toMatchObject({ id: "package:premium", subtotal: 2_000_000 });
    expect(quote.packageId).toBe("premium");
    expect(quote.formState.agentOverrideItems).toBe(false);
  });

  it("TEST E. 사용자가 말한 견적 제목 원문을 보존한다", () => {
    const quote = buildAgentQuoteData(customInput({ title: "BGN 2026 가을 브랜딩 촬영" }), undefined, "BGN 10명 인당 30만원");
    expect(quote.title).toBe("BGN 2026 가을 브랜딩 촬영");
    expect(quote.formState.quoteTitle).toBe("BGN 2026 가을 브랜딩 촬영");
  });

  it("TEST F. 명·컷·컨셉·장 수를 서로 다른 포함 서비스 필드에 둔다", () => {
    const quote = buildAgentQuoteData(customInput({
      includedServices: [
        { type: "profile", label: "프로필 촬영", personCount: 10, cutCount: 2, conceptCount: null, deliverableCount: null, description: null },
        { type: "group", label: "단체 촬영", personCount: null, cutCount: null, conceptCount: 2, deliverableCount: 20, description: null },
      ],
    }), undefined, "BGN 10명 인당 30만원, 프로필 각 2컷, 단체 2컨셉 약 20장");
    expect(quote.formState.profileCount).toBe(0);
    expect(quote.formState.stagedCount).toBe(0);
    expect(quote.formState.includedServices).toEqual([
      expect.objectContaining({ personCount: 10, cutCount: 2 }),
      expect.objectContaining({ conceptCount: 2, deliverableCount: 20 }),
    ]);
    expect(quote.items.slice(1).every((item) => item.subtotal === 0)).toBe(true);
  });

  it("TEST G. 퍼센트 할인은 원형과 계산 금액을 함께 저장한다", () => {
    const quote = buildAgentQuoteData(customInput({ discountRate: 10, customTotalPrice: "270만원" }), undefined, "BGN 10명 인당 30만원, 10% 할인해서 총 270만원");
    expect(quote.discountAmount).toBe(300_000);
    expect(quote.totalAmount).toBe(2_700_000);
    expect(quote.formState.discount).toEqual({ type: "percent", value: 10 });
  });

  it("TEST H. 정액 할인을 원화로 계산한다", () => {
    const quote = buildAgentQuoteData(customInput({ discountAmount: "20만원" }), undefined, "BGN 10명 인당 30만원, 20만원 할인");
    expect(quote.discountAmount).toBe(200_000);
    expect(quote.totalAmount).toBe(2_800_000);
  });

  it("TEST I. 단가×수량과 명시 총액이 충돌하면 생성하지 않는다", () => {
    expect(() => buildAgentQuoteData(customInput({ customTotalPrice: "250만원" }), undefined, "BGN 10명 인당 30만원인데 총액 250만원"))
      .toThrow(/어느 금액을 적용/);
  });

  it("TEST J. 명시되지 않은 연락처는 빈 문자열로 바꾸지 않고 null로 전달한다", () => {
    const quote = buildAgentQuoteData(customInput(), undefined, "BGN 10명 인당 30만원");
    expect(quote).toMatchObject({ contactName: null, phone: null, email: null });
  });

  it("TEST K. 포함 서비스 표시 문구에 의미별 단위를 유지한다", () => {
    expect(formatIncludedService({ type: "group", label: "단체 촬영", conceptCount: 2, deliverableCount: 20 }))
      .toBe("단체 촬영 2컨셉 / 약 20장");
  });
});

describe("Telegram Quote Summary Preview", () => {
  it("canonical quote row의 최신 값으로 카드 본문을 만든다", () => {
    const summary = buildTelegramQuoteSummary({
      id: "quote-bgn",
      quote_number: "Q-20260912-1",
      title: "BGN 브랜딩 촬영 견적서",
      hospital_name: "BGN성형외과",
      items: [
        { name: "브랜드 촬영", detail: "10명 × 300,000원", unitPrice: 300_000, qty: 10, subtotal: 3_000_000 },
        { name: "프로필 촬영 10명 2컷", unitPrice: 0, qty: 1, subtotal: 0 },
      ],
      discount_amount: 300_000,
      total_amount: 2_700_000,
      form_state: { discount: { type: "percent", value: 10 } },
    });
    expect(formatTelegramQuoteSummary(summary)).toContain("브랜드 촬영");
    expect(formatTelegramQuoteSummary(summary)).toContain("프로필 촬영 10명 2컷 — 포함");
    expect(formatTelegramQuoteSummary(summary)).toContain("할인 10%  -300,000원");
    expect(formatTelegramQuoteSummary(summary)).toContain("최종 금액  2,700,000원");
  });
});
