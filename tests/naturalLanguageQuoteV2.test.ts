import { describe, expect, it } from "vitest";
import { formatIncludedService, resolveQuotePricingMode } from "@/lib/quote/agentQuote";
import {
  buildTelegramQuoteSummary,
  formatTelegramQuoteSummary,
} from "@/lib/quote/telegramQuoteSummary";

describe("Natural Language Quote", () => {
  it("패키지는 사용자 원문에 명시된 경우만 쓴다", () => {
    expect(resolveQuotePricingMode({}, "BGN 10명 인당 30만원 견적")).toBe("custom");
    expect(resolveQuotePricingMode({}, "BGN 프리미엄 패키지 견적")).toBe("package");
  });

  it("포함 서비스 표시 문구에 의미별 단위를 유지한다", () => {
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
