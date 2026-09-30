import { describe, expect, it } from "vitest";
import { parseQuoteRequest } from "@/lib/quote/quoteRequestParser";
import { buildQuoteDataFromParsedRequest, titleForParsedQuote } from "@/lib/quote/quoteRequestData";

const JAKE_REQUEST = `1989 삼칠갈비 견적서
양형석팀장님
010-8232-5660
yhsteamleader@gamil.com

내용은
1. 음식사진촬영 150만원
- 메뉴촬영, 단품촬영, 세트촬영, 인테리어(외관)
- 3회 방문

2. 푸드스타일링 50만원
- 메인메뉴 및 단품(고기류, 단품메뉴) 스타일링

3. 재료구입비 28750원
- 상추, 무순, 레몬 등

>> 1000원 미만 절삭해줘`;

const PHOTOCLINIC_REQUEST = `강남스마트치과의원
정연호원장님
010-5554-2859
smartdentalgn@gamil.com

프리미엄패키지
의료진프로필 2명 추가
포인트영상 서비스
헤어메이크업 15만원
모델섭외15만원

소개할인으로 10%할인적용`;

const FIXED_TOTAL_REQUEST = `강남센스치과의원
정연호원장님
010-5554-2859
smartdentalgn@gamil.com

프리미엄패키지
의료진프로필 3명 추가
포인트영상 서비스

>> 총 금액 250으로 결정`;

describe("quoteRequestParser", () => {
  it("대표의 제이크이미지 원문을 금액과 설명을 잃지 않고 읽고 절삭한다", () => {
    const request = parseQuoteRequest(JAKE_REQUEST);
    expect(request.clientName).toBe("1989 삼칠갈비");
    expect(request.contactName).toBe("양형석팀장님");
    expect(request.phone).toBe("010-8232-5660");
    expect(request.email).toBe("yhsteamleader@gmail.com");
    expect(request.emailCorrectedFrom).toBe("yhsteamleader@gamil.com");
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
    expect(quote.formState.customItems).toHaveLength(2);
    expect(quote.formState.customItems).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "절삭" }),
    ]));
    expect(quote.formState.extraDiscount).toBe(750);
    expect(quote.totals.discountTotal).toBe(750);
    expect(quote.totals).toMatchObject({ supplyAmount: 2_028_000, vat: 202_800, finalAmount: 2_230_800, extraDiscountAmount: 750 });
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

  it("포토클리닉 패키지·서비스·외주를 원문 금액대로 읽고 외주에는 소개할인을 적용하지 않는다", () => {
    const request = parseQuoteRequest(PHOTOCLINIC_REQUEST);
    expect(request).toMatchObject({
      clientName: "강남스마트치과의원",
      contactName: "정연호원장님",
      phone: "010-5554-2859",
      email: "smartdentalgn@gmail.com",
      emailCorrectedFrom: "smartdentalgn@gamil.com",
      discount: { label: "소개할인", type: "percent", value: 10 },
    });
    expect(request.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "프리미엄패키지", amount: 2_000_000 }),
      expect.objectContaining({ name: "의료진프로필 2명 추가", quantity: 2, amount: 250_000 }),
      expect.objectContaining({ name: "포인트영상", free: true, amount: 0 }),
      expect.objectContaining({ name: "헤어메이크업", amount: 150_000 }),
      expect.objectContaining({ name: "모델섭외", amount: 150_000 }),
    ]));

    const quote = buildQuoteDataFromParsedRequest({ request, brand: "photoclinic" });
    expect(titleForParsedQuote(request, "photoclinic")).toBe("강남스마트치과의원 브랜드촬영 견적서");
    expect(quote.formState.benefitItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.stringContaining("정가 800,000원 → 서비스") }),
    ]));
    expect(quote.totals).toMatchObject({
      discountableSubtotal: 2_500_000,
      nonDiscountableCustomTotal: 300_000,
      discountTotal: 250_000,
      supplyAmount: 2_550_000,
      vat: 255_000,
      finalAmount: 2_805_000,
      depositAmount: 1_402_500,
      balanceAmount: 1_402_500,
    });
  });

  it("지정 총액 차액은 항목이 아니라 추가할인으로 남긴다", () => {
    const request = parseQuoteRequest(FIXED_TOTAL_REQUEST);
    expect(request.fixedTotal).toBe(2_500_000);
    const quote = buildQuoteDataFromParsedRequest({ request, brand: "photoclinic" });
    expect(quote.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "프리미엄패키지", subtotal: 2_000_000 }),
      expect.objectContaining({ name: "의료진프로필 3명 추가", subtotal: 750_000 }),
    ]));
    expect(quote.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "특별조정" }),
    ]));
    expect(quote.formState.extraDiscount).toBe(250_000);
    expect(quote.totals).toMatchObject({
      contentSubtotal: 2_750_000,
      discountTotal: 250_000,
      supplyAmount: 2_500_000,
      vat: 250_000,
      finalAmount: 2_750_000,
    });
  });

  it("행사 제목에는 브랜드촬영을 덧붙이지 않는다", () => {
    const request = parseQuoteRequest("예방치과교실 60주년 행사");
    expect(request).toMatchObject({ clientName: "예방치과교실 60주년 행사", isEvent: true });
    expect(titleForParsedQuote(request, "jakeimage")).toBe("예방치과교실 60주년 행사 견적서");
  });

  it("금액·수량·괄호를 바꿔 읽지 않는다", () => {
    expect(parseQuoteRequest("고객\n음식사진촬영 150만원(3회방문)").items[0]).toMatchObject({ name: "음식사진촬영", amount: 1_500_000, quantity: 1, note: "3회방문" });
    expect(parseQuoteRequest("고객\n인테리어(외관) 50만원").items[0]).toMatchObject({ name: "인테리어(외관)", amount: 500_000, note: null });
    expect(parseQuoteRequest("고객\n모델섭외15만원").items[0]).toMatchObject({ name: "모델섭외", amount: 150_000 });
    expect(parseQuoteRequest("고객\n재료구입비 28750원").items[0]).toMatchObject({ name: "재료구입비", amount: 28_750 });
  });

  it("연결어·번호·불릿이 같은 줄에 겹쳐도 항목명과 설명 앞에서 모두 제거한다", () => {
    const request = parseQuoteRequest("1989 청담 스시 견적서\n내용은 1. 음식사진촬영 150만원\n - - 상추, 무순, 레몬 등");
    expect(request.items).toEqual([
      expect.objectContaining({ name: "음식사진촬영", amount: 1_500_000, details: ["상추, 무순, 레몬 등"] }),
    ]);
    expect(titleForParsedQuote(request, "jakeimage")).toBe("1989 청담 스시 브랜드촬영(음식) 견적서");
  });

  it("어디에도 넣을 수 없는 줄은 버리지 않는다", () => {
    const request = parseQuoteRequest("테스트 회사 견적서\n이 문장은 항목도 연락처도 아닙니다");
    expect(request.unparsedLines).toEqual(["이 문장은 항목도 연락처도 아닙니다"]);
  });
});
