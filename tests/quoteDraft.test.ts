import { describe, expect, it } from "vitest";
import { hasMeaningfulQuoteContent } from "@/lib/quote/quoteDraft";

describe("quote draft content", () => {
  it("날짜와 견적번호만 있는 빈 초기 폼은 견적이 아니다", () => {
    expect(hasMeaningfulQuoteContent({ hospitalName: "", items: [], totalAmount: 0 })).toBe(false);
  });

  it("병원명, 항목, 금액 중 하나가 있으면 실제 견적으로 본다", () => {
    expect(hasMeaningfulQuoteContent({ hospitalName: "테스트의원", items: [], totalAmount: 0 })).toBe(true);
    expect(hasMeaningfulQuoteContent({ hospitalName: "", items: [{ name: "프로필" }], totalAmount: 0 })).toBe(true);
    expect(hasMeaningfulQuoteContent({ hospitalName: "", items: [], totalAmount: 350_000 })).toBe(true);
  });
});
