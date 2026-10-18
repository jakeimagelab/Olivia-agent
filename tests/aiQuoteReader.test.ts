import { describe, expect, it } from "vitest";
import { toParsedQuoteRequest, verifyReadingAgainstText, type QuoteReading } from "@/lib/quote/aiQuoteReader";
import { buildQuoteDataFromParsedRequest } from "@/lib/quote/quoteRequestData";

const SOURCE = `전주푸른안과 견적서 만들어.

전주푸른안과 사진/영상 촬영
대표원장님
연락처 및 메일주소 공란으로 하고
촬영일 10월 26일

의료진 프로필
의료진 컨셉연출(진료/수술)

서비스/혜택
- 단체사진 및 컨셉사진
- 기타 병원 분위기 사진
- 주요 인테리어 및 외관

금액은 항목별로 나눌 필요없고,
전체 금액 370만원(부가세별도)
잔금 50%`;

const READING: QuoteReading = {
  clientName: "전주푸른안과", titleTopic: "사진/영상 촬영", isEvent: false,
  contactName: "대표원장님", phone: null, email: null, blankContact: true,
  shootDate: "2026-10-26",
  items: [
    { name: "의료진 프로필", details: [], amount: null, quantity: 1, free: false },
    { name: "의료진 컨셉연출(진료/수술)", details: [], amount: null, quantity: 1, free: false },
    { name: "단체사진 및 컨셉사진", details: [], amount: 0, quantity: 1, free: true },
    { name: "기타 병원 분위기 사진", details: [], amount: 0, quantity: 1, free: true },
    { name: "주요 인테리어 및 외관", details: [], amount: 0, quantity: 1, free: true },
  ],
  fixedTotal: 3_700_000, itemPricesHidden: true, vatIncluded: false, depositRate: 50,
  discount: null, roundDownUnit: null, brandExplicit: null, unreadLines: [], uncertain: [],
};

describe("AI quote reader verification", () => {
  it("원문에 없는 고객명·항목·금액을 비우고 uncertain에 남긴다", () => {
    const verified = verifyReadingAgainstText({
      ...READING,
      clientName: "없는병원",
      items: [...READING.items, { name: "없는 항목", details: [], amount: 990_000, quantity: 1, free: false }],
      fixedTotal: 9_900_000,
    }, SOURCE);
    expect(verified.clientName).toBeNull();
    expect(verified.items.some((item) => item.name === "없는 항목")).toBe(false);
    expect(verified.fixedTotal).toBeNull();
    expect(verified.uncertain.join("\n")).toContain("원문에 없는 값이라 비웠어요");
  });

  it("370만원과 3,700,000을 같은 값으로 검증한다", () => {
    expect(verifyReadingAgainstText(READING, SOURCE).fixedTotal).toBe(3_700_000);
  });

  it("전주푸른안과 판독을 기존 계산기로만 계산한다", () => {
    const parsed = toParsedQuoteRequest(verifyReadingAgainstText(READING, SOURCE));
    const quote = buildQuoteDataFromParsedRequest({ request: parsed, brand: "photoclinic" });
    expect(quote.title).toBe("전주푸른안과 브랜드촬영 견적서");
    expect(parsed).toMatchObject({ contactName: "대표원장님", phone: null, email: null, shootDate: "2026-10-26", fixedTotal: 3_700_000, itemPricesHidden: true, depositRate: 50 });
    expect(parsed.items.filter((item) => !item.free).map((item) => item.name)).toEqual(["의료진 프로필", "의료진 컨셉연출(진료/수술)"]);
    expect(parsed.items.filter((item) => item.free)).toHaveLength(3);
    expect(quote.totals).toMatchObject({ supplyAmount: 3_700_000, vat: 370_000, finalAmount: 4_070_000, depositAmount: 2_035_000, balanceAmount: 2_035_000 });
  });
});
