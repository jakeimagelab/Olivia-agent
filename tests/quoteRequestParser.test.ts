import { describe, expect, it } from "vitest";
import { parseQuoteRequest } from "@/lib/quote/quoteRequestParser";
import { buildQuoteDataFromParsedRequest, titleForParsedQuote } from "@/lib/quote/quoteRequestData";

const JAKE_REQUEST = `1989 삼칠갈비 견적서
양형석팀장님
010-8232-5660
OOOOO@gmail.com

내용은
1. 음식사진촬영 150만원
- 메뉴촬영, 단품촬영, 세트촬영, 인테리어(외관)
- 3회 방문

2. 푸드스타일링 50만원
- 메인메뉴 및 단품(고기류, 단품메뉴) 스타일링

3. 재료구입비 28750원
- 상추, 무순, 레몬 등

>> 1000원 미만 절삭해줘`;

describe("quoteRequestParser", () => {
  it("대표의 제이크이미지 원문을 금액과 설명을 잃지 않고 읽고 절삭한다", () => {
    const request = parseQuoteRequest(JAKE_REQUEST);
    expect(request.clientName).toBe("1989 삼칠갈비");
    expect(request.contactName).toBe("양형석팀장님");
    expect(request.phone).toBe("010-8232-5660");
    expect(request.email).toBe("OOOOO@gmail.com");
    expect(request.roundDownUnit).toBe(1000);
    expect(request.items).toEqual([
      expect.objectContaining({ name: "음식사진촬영", amount: 1_500_000, details: ["메뉴촬영, 단품촬영, 세트촬영, 인테리어(외관)", "3회 방문"] }),
      expect.objectContaining({ name: "푸드스타일링", amount: 500_000 }),
      expect.objectContaining({ name: "재료구입비", amount: 28_750 }),
    ]);
    expect(request.unparsedLines).toEqual([]);

    const quote = buildQuoteDataFromParsedRequest({ request, brand: "jakeimage" });
    expect(titleForParsedQuote(request, "jakeimage")).toBe("1989 삼칠갈비 브랜드촬영(음식) 견적서");
    expect(quote.formState.selectedSingleItemIds).toContain("directing");
    expect(quote.formState.singleItemAmounts.directing).toBe(1_500_000);
    expect(quote.formState.singleItemNotes.directing).toContain("3회 방문");
    expect(quote.formState.customItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "푸드스타일링", amount: 500_000 }),
      expect.objectContaining({ name: "재료구입비", amount: 28_750 }),
    ]));
    expect(quote.totals).toMatchObject({ supplyAmount: 2_028_000, vat: 202_800, finalAmount: 2_230_800, roundDownAmount: 750 });
  });

  it("알려진 이메일 도메인 오타만 고치고 원본을 보존한다", () => {
    const request = parseQuoteRequest("테스트 회사 견적서\n담당자님\ntest@gamil.com\n제품촬영 50만원");
    expect(request.email).toBe("test@gmail.com");
    expect(request.emailCorrectedFrom).toBe("test@gamil.com");
  });

  it("금액 없는 낯선 외주 항목은 임의 가격을 만들지 않는다", () => {
    const request = parseQuoteRequest("테스트 회사 견적서\n헤어메이크업\n제품촬영 50만원");
    expect(request.items[0]).toMatchObject({ name: "헤어메이크업", amount: null });
  });
});
