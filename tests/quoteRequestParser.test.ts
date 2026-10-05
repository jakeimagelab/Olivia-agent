import { describe, expect, it } from "vitest";
import { parseQuoteRequest, quoteCreationTargetFromRequest } from "@/lib/quote/quoteRequestParser";
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

const HEADERED_PHOTOCLINIC_REQUEST = `견적서 하나 만들어줘!
강남스마트치과의원
정연호원장님
010-5554-2859
smartdentalgn@gamil.com
프리미엄패키지
의료진프로필 2명 추가
포인트영상 서비스
헤어메이크업 156000원
모델섭외152000원
소개할인으로 10%할인적용하고
만원 미만 절삭
잔금은 100%로 진행`;

const DAEJEON_SESANG_REQUEST = `대전세상안과
대표원장님
의료진 7명이고, 프로필 및 연출촬영
인당 50만원으로 총금액 350만원
서비스/혜택
•10% 할인
•또는 헤어메이크업포함
이렇게 견적 만들어줘`;

const INLINE_EVENT_REQUEST = `견적서 만들어줘, 세계여성이사업회(WCD) 10주년 기념포럼
행사스케치 15:30 - 20:30
1부, 2부 진행
작가 2명으로 진행
총 금액 135만원`;

const WEDDING_REQUEST = `견적서 하나 만들어줘요!
양재선변호사님(민정님) 웨딩촬영 및 영상제작 견적서

* •웨딩촬영(스케치) 80만원
* •영상제작 및 동시재생 시스템 구축 45만원
* •영상제작 관련 25만원 할인하여 총 촬영(제작)비는 100만원

액자 추가 건
- 40cm 아크릴 3개 = 개당 92000원
- 25cm 아크릴 4개 = 개당 46000원`;

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
    expect(quote.formState.customItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "음식사진촬영", amount: 1_500_000, detail: expect.stringContaining("3회 방문") }),
      expect.objectContaining({ name: "푸드스타일링", amount: 500_000 }),
      expect.objectContaining({ name: "재료구입비", amount: 28_750 }),
    ]));
    expect(quote.formState.customItems).toHaveLength(3);
    expect(quote.formState.customItems).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "절삭" }),
    ]));
    expect(quote.formState.extraDiscount).toBe(0);
    expect(quote.totals.discountTotal).toBe(0);
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

  it("지정 총액 차액은 항목이 아니라 특별조정으로 남긴다", () => {
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
    expect(quote.formState.extraDiscount).toBe(0);
    expect(quote.totals).toMatchObject({
      contentSubtotal: 2_750_000,
      discountTotal: 0,
      specialAdjustmentAmount: -250_000,
      supplyAmount: 2_500_000,
      vat: 250_000,
      finalAmount: 2_750_000,
    });
  });

  it("생성 지시 첫 줄은 고객명이 아니며 만원 절삭과 잔금 100%를 지시로 읽는다", () => {
    const request = parseQuoteRequest(HEADERED_PHOTOCLINIC_REQUEST);
    expect(request).toMatchObject({
      clientName: "강남스마트치과의원",
      roundDownUnit: 10_000,
      depositRate: 0,
      unparsedLines: [],
    });
    expect(request.items).toHaveLength(5);
    expect(request.items.find((item) => item.name === "모델섭외")?.details).toEqual([]);

    const quote = buildQuoteDataFromParsedRequest({ request, brand: "photoclinic" });
    expect(titleForParsedQuote(request, "photoclinic")).toBe("강남스마트치과의원 브랜드촬영 견적서");
    expect(quote.formState).toMatchObject({ depositRate: 0, roundDownUnit: 10_000, extraDiscount: 0 });
    expect(quote.totals).toMatchObject({
      supplyAmount: 2_550_000,
      vat: 255_000,
      finalAmount: 2_805_000,
      depositAmount: 0,
      balanceAmount: 2_805_000,
    });
  });

  it("카탈로그에 없는 총액 문장은 항목·이름을 추정하지 않고 검산값으로만 읽는다", () => {
    const request = parseQuoteRequest(DAEJEON_SESANG_REQUEST);
    expect(request.clientName).toBe("대전세상안과");
    expect(request.contactName).toBe("대표원장님");
    expect(request.items[0]).toMatchObject({ name: "의료진 7명이고, 프로필 및 연출촬영", amount: 1_200_000 });
    expect(request.items[0].details).not.toContain("인당 50만원으로 총금액 350만원");
    expect(request.checkTotal).toBe(3_500_000);
  });

  it("행사 제목에는 브랜드촬영을 덧붙이지 않는다", () => {
    const request = parseQuoteRequest("예방치과교실 60주년 행사");
    expect(request).toMatchObject({ clientName: "예방치과교실 60주년 행사", isEvent: true });
    expect(titleForParsedQuote(request, "jakeimage")).toBe("예방치과교실 60주년 행사 견적서");
  });

  it("생성 지시와 같은 줄에 붙은 조각을 고객명으로 쓰지 않는다", () => {
    const request = parseQuoteRequest(INLINE_EVENT_REQUEST);
    expect(request.clientName).not.toBe("견적서 만들어줘, 세계여성이사업회(WCD) 10주년 기념포럼");
    expect(request.clientName).not.toBe("요!");
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

  it("여러 줄 견적 원문의 고객·항목은 고객 선택 가드보다 먼저 확인한다", () => {
    expect(quoteCreationTargetFromRequest(PHOTOCLINIC_REQUEST)).toBe("강남스마트치과의원");
    expect(quoteCreationTargetFromRequest("강남스마트치과의원 견적서 열어줘")).toBeNull();
  });

  it("어디에도 넣을 수 없는 줄은 버리지 않는다", () => {
    const request = parseQuoteRequest("테스트 회사 견적서\n이 문장은 항목도 연락처도 아닙니다");
    expect(request.unparsedLines).toEqual(["이 문장은 항목도 연락처도 아닙니다"]);
  });

  it("[10/05] 웨딩 견적의 고객·표시명·묶음·수량·검산을 원문 그대로 보존한다", () => {
    const request = parseQuoteRequest(WEDDING_REQUEST);
    expect(request).toMatchObject({
      clientName: "양재선변호사님(민정님)",
      titleSuffix: "웨딩촬영 및 영상제작",
      isEvent: true,
      contactName: null,
      phone: null,
      email: null,
      discount: { label: "영상제작 관련", type: "amount", value: 250_000 },
      checkTotal: 1_000_000,
      unparsedLines: [],
    });
    expect(request.items).toEqual([
      expect.objectContaining({ name: "웨딩촬영(스케치)", quantity: 1, amount: 800_000, groupLabel: null }),
      expect.objectContaining({ name: "영상제작 및 동시재생 시스템 구축", quantity: 1, amount: 450_000, groupLabel: null }),
      expect.objectContaining({ name: "40cm 아크릴", quantity: 3, amount: 92_000, groupLabel: "액자 추가 건" }),
      expect.objectContaining({ name: "25cm 아크릴", quantity: 4, amount: 46_000, groupLabel: "액자 추가 건" }),
    ]);

    const quote = buildQuoteDataFromParsedRequest({ request, brand: "jakeimage" });
    expect(titleForParsedQuote(request, "jakeimage")).toBe("양재선변호사님(민정님) 웨딩촬영 및 영상제작 견적서");
    expect(quote.items.map((item) => item.name)).toEqual([
      "웨딩촬영(스케치)", "영상제작 및 동시재생 시스템 구축", "40cm 아크릴", "25cm 아크릴",
    ]);
    expect(quote.items.slice(2).map((item) => ({ qty: item.qty, subtotal: item.subtotal }))).toEqual([
      { qty: 3, subtotal: 276_000 }, { qty: 4, subtotal: 184_000 },
    ]);
    expect(quote.formState.customItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "웨딩촬영(스케치)", quantity: 1, unitPrice: 800_000, amount: 800_000 }),
      expect.objectContaining({ name: "영상제작 및 동시재생 시스템 구축", quantity: 1, unitPrice: 450_000, amount: 450_000 }),
      expect.objectContaining({ name: "40cm 아크릴", groupLabel: "액자 추가 건", quantity: 3, unitPrice: 92_000, amount: 276_000 }),
      expect.objectContaining({ name: "25cm 아크릴", groupLabel: "액자 추가 건", quantity: 4, unitPrice: 46_000, amount: 184_000 }),
    ]));
    expect(quote.items.some((item) => item.name.includes("총 촬영"))).toBe(false);
    expect(quote.totals).toMatchObject({
      contentSubtotal: 1_710_000,
      discountTotal: 250_000,
      supplyAmount: 1_460_000,
      vat: 146_000,
      finalAmount: 1_606_000,
      depositAmount: 803_000,
      balanceAmount: 803_000,
    });
  });

  it("[10/05] 검산이 맞지 않으면 저장 데이터 만들기를 멈춘다", () => {
    const request = parseQuoteRequest(WEDDING_REQUEST.replace("총 촬영(제작)비는 100만원", "총 촬영(제작)비는 120만원"));
    expect(() => buildQuoteDataFromParsedRequest({ request, brand: "jakeimage" }))
      .toThrow("적어주신 금액과 계산이 안 맞아요.\n  적어주신 것:  1,200,000\n  계산한 것:    1,000,000 (할인 적용 후)\n어느 쪽이 맞나요?");
  });

  it("[10/05] 개수와 단가어가 함께 있을 때만 수량으로 읽고, 방문 횟수는 수량으로 읽지 않는다", () => {
    const request = parseQuoteRequest(`고객\n40cm 아크릴 3개 = 개당 92000원\n25cm 아크릴 4개 = 개당 46000원\n음식사진촬영 150만원(3회방문)`);
    expect(request.items).toEqual([
      expect.objectContaining({ name: "40cm 아크릴", quantity: 3, amount: 92_000 }),
      expect.objectContaining({ name: "25cm 아크릴", quantity: 4, amount: 46_000 }),
      expect.objectContaining({ name: "음식사진촬영", quantity: 1, amount: 1_500_000, note: "3회방문" }),
    ]);
  });

  it("[10/05] 할인 없는 총액 문장은 검산값만 만들고 항목이나 할인으로 만들지 않는다", () => {
    const request = parseQuoteRequest("고객\n제품촬영 150만원\n총 100만원");
    expect(request.discount).toBeNull();
    expect(request.checkTotal).toBe(1_000_000);
    expect(request.items.map((item) => item.name)).toEqual(["제품촬영"]);
  });

  it("[10/05] 지시 어미는 모두 고객 후보에서 제외한다", () => {
    for (const command of ["만들어줘", "만들어줘요", "만들어주세요", "해줘요"]) {
      const request = parseQuoteRequest(`${command}!\n제품촬영 50만원`);
      expect(request.clientName).toBeNull();
    }
  });

  it("[10/05] 행사 제목은 견적서를 한 번만 붙이고 괄호가 맞지 않으면 저장하지 않는다", () => {
    const request = parseQuoteRequest("양재선변호사님(민정님) 웨딩촬영 견적서\n웨딩촬영 80만원");
    expect(titleForParsedQuote(request, "jakeimage")).toBe("양재선변호사님(민정님) 웨딩촬영 견적서");

    const broken = { ...request, titleSuffix: "웨딩촬영(", isEvent: true };
    expect(() => buildQuoteDataFromParsedRequest({ request: broken, brand: "jakeimage" }))
      .toThrow("견적서 제목의 괄호 짝이 맞지 않아 저장하지 않았어요.");
  });
});
