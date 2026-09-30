import { computeQuoteTotals } from "@/lib/quote/computeQuoteTotals";
import { packageOptions, packages, singleItems } from "@/lib/quote/quoteCatalog";
import type { Brand, CustomItem } from "@/lib/quote/quoteFormTypes";
import type { ParsedQuoteItem, ParsedQuoteRequest } from "@/lib/quote/quoteRequestParser";

export type QuoteRequestBrand = Brand;

export type QuoteRequestBuildInput = {
  request: ParsedQuoteRequest;
  brand: QuoteRequestBrand;
  workflowRunId?: string;
  clientId?: string;
};

type QuoteLineItem = {
  id: string;
  name: string;
  detail: string;
  unitPrice: number;
  qty: number;
  subtotal: number;
  note?: string;
};

const EXTERNAL_ITEM = /(헤어\s*메이크업|메이크업|헤메|모델\s*섭외|모델료|섭외|외주)/i;

function today(offset = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })
    .format(new Date(Date.now() + offset * 86_400_000));
}

function normalize(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("ko-KR").replace(/[\s_\-]+/g, "");
}

function jakeSingleId(name: string) {
  // 설명줄이 아니라 대표가 쓴 항목 이름 하나만으로 분류한다.
  // 푸드스타일링은 음식 촬영이 아니라 별도 외주 항목이다.
  if (/푸드\s*스타일링/.test(name)) return null;
  if (/(음식|메뉴|푸드|단품|세트|연출|제품)/.test(name)) return "directing";
  if (/(프로필|인물|원장)/.test(name)) return "studio-profile";
  if (/(스케치|현장|행사)/.test(name)) return "sketch";
  if (/(인테리어|공간|외관)/.test(name)) return "interior";
  if (/(영상|필름)/.test(name)) return "video-shoot";
  return null;
}

function photoclinicSingleId(name: string) {
  const normalizedName = normalize(name);
  const known: Array<[string, string]> = [
    ["프로필촬영", "studio-profile"], ["연출촬영", "directing"], ["인테리어촬영", "interior"],
    ["브랜드필름", "brand-film"], ["포인트영상", "point-video"],
  ];
  return known.find(([label]) => normalizedName.includes(normalize(label)))?.[1] ?? null;
}

function titleTopic(item: ParsedQuoteItem | undefined) {
  if (!item) return null;
  const topic = item.name.replace(/브랜드\s*/g, "").replace(/사진|촬영/g, "").trim();
  return topic || null;
}

export function titleForParsedQuote(request: ParsedQuoteRequest, brand: Brand) {
  const client = request.clientName?.trim();
  if (!client) throw new Error("견적서 제목을 만들 고객명을 원문에서 찾지 못했어요.");
  if (request.isEvent) return `${client}${request.titleSuffix ? ` ${request.titleSuffix}` : ""} 견적서`;
  if (brand === "jakeimage") {
    const topic = titleTopic(request.items[0]);
    return `${client} 브랜드촬영${topic ? `(${topic})` : ""} 견적서`;
  }
  return `${client} 브랜드촬영 견적서`;
}

function detailOf(item: ParsedQuoteItem) {
  return [item.note ? `(${item.note})` : "", ...item.details].filter(Boolean).join("\n");
}

function toCustomItem(item: ParsedQuoteItem, index: number): CustomItem {
  const amount = Math.max(0, Number(item.amount) || 0) * Math.max(1, item.quantity);
  return {
    id: `parsed:custom:${index}`,
    name: item.name,
    detail: detailOf(item),
    amount,
    discountable: !EXTERNAL_ITEM.test(item.name),
  };
}

function packageIdFor(items: ParsedQuoteItem[]) {
  return items
    .map((item) => packages.find((entry) => normalize(item.name).includes(normalize(entry.name)))?.id)
    .find((value): value is string => Boolean(value)) ?? null;
}

function benefitLabel(item: ParsedQuoteItem, hasPackage: boolean) {
  // 서비스/혜택 섹션의 문구는 이미 서비스라는 맥락 안에 있으므로 "· 서비스"나 정가를
  // 덧붙이지 않는다. 사용자가 적은 혜택 이름을 그대로 문서에 보인다.
  if (item.benefitOnly) return [item.name, detailOf(item)].filter(Boolean).join(" · ");
  const normalizedName = normalize(item.name);
  // 포인트영상은 단독 판매가와 패키지 옵션가가 다르다. 패키지에 함께 적혔을 때만
  // 옵션 정가를 보여주고, 그 외에는 단일항목 정가를 보여준다.
  const catalog = hasPackage && normalizedName.includes(normalize("포인트영상"))
    ? packageOptions.find((entry) => entry.id === "point-video-option")
    : [...singleItems, ...packageOptions, ...packages].find((entry) => normalizedName.includes(normalize(entry.name)));
  const suffix = catalog ? `정가 ${catalog.price.toLocaleString("ko-KR")}원 → 서비스` : "서비스";
  return [item.name, detailOf(item), suffix].filter(Boolean).join(" · ");
}

/**
 * Parsed user text -> canonical quote payload. This is deliberately independent from an LLM tool schema:
 * every amount and item is taken from ParsedQuoteRequest, which itself came from the original user message.
 */
export function buildQuoteDataFromParsedRequest(input: QuoteRequestBuildInput) {
  const { request, brand } = input;
  // 0% 선금은 "잔금 100%"라는 명시적 결제조건이다. || 50을 쓰면 그 값을 조용히
  // 기본값으로 덮어쓰므로 null일 때만 기존 기본 결제조건을 쓴다.
  const depositRate = request.depositRate ?? 50;
  const title = titleForParsedQuote(request, brand);
  const requestHasPackage = request.items.some((item) => /패키지/.test(item.name));
  const selectedPackageId = requestHasPackage ? packageIdFor(request.items) : null;
  const singleItemNotes: Record<string, string> = {};
  const singleItemAmounts: Record<string, number> = {};
  const selectedSingleItemIds: string[] = [];
  const customItems: CustomItem[] = [];
  const benefitItems: Array<{ id: string; name: string }> = [];
  const canonicalItems: QuoteLineItem[] = [];

  request.items.forEach((item, index) => {
    const quantity = Math.max(1, item.quantity || 1);
    const detail = detailOf(item);
    const amount = item.free ? 0 : item.amount;
    const subtotal = amount === null ? 0 : Math.max(0, amount) * quantity;
    const mappedId = brand === "jakeimage" ? jakeSingleId(item.name) : photoclinicSingleId(item.name);
    const catalogPrice = brand === "photoclinic" && mappedId
      ? singleItems.find((entry) => entry.id === mappedId)?.price
      : undefined;
    const isPackage = selectedPackageId && packages.some((entry) => entry.id === selectedPackageId && normalize(item.name).includes(normalize(entry.name)));

    canonicalItems.push({
      id: `parsed:${index}`,
      name: item.name,
      detail,
      unitPrice: amount ?? 0,
      qty: quantity,
      subtotal,
      note: item.free ? "서비스" : amount === null ? "금액 입력 필요" : item.note || undefined,
    });

    if (item.free) {
      benefitItems.push({ id: `parsed:benefit:${index}`, name: benefitLabel(item, Boolean(selectedPackageId)) });
      return;
    }
    if (isPackage) return;
    // 포토클리닉 단일항목도 금액을 직접 말했으면 그 원문 금액을 우선한다. 고정 카탈로그
    // 버튼은 가격을 말하지 않았거나 정확히 같은 값일 때만 사용한다.
    if (mappedId && (brand === "jakeimage" || item.amount === null || item.amount === catalogPrice)) {
      if (!selectedSingleItemIds.includes(mappedId)) selectedSingleItemIds.push(mappedId);
      if (brand === "jakeimage") {
        singleItemNotes[mappedId] = detail;
        singleItemAmounts[mappedId] = subtotal;
      }
      return;
    }
    customItems.push(toCustomItem(item, index));
  });

  const packageTotal = selectedPackageId ? packages.find((entry) => entry.id === selectedPackageId)?.price ?? 0 : 0;
  const singleItemsTotal = brand === "jakeimage"
    ? Object.values(singleItemAmounts).reduce((sum, amount) => sum + amount, 0)
    : request.items
      .filter((item) => Boolean(photoclinicSingleId(item.name)) && !item.free)
      .reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0) * Math.max(1, item.quantity), 0);
  const discountRate = request.discount?.type === "percent" ? request.discount.value : 0;
  const requestedExtraDiscount = request.discount?.type === "amount" ? request.discount.value : 0;
  // 총액 확정·절삭은 항목이 아니라 할인이다. 먼저 원문 지시가 만든 차액을 계산한 뒤,
  // 할인으로 표현 가능한 음수 조정만 extraDiscount에 합친다. 항목 배열에는 절대 넣지 않는다.
  const adjustmentProbe = computeQuoteTotals({
    packageTotal,
    singleItemsTotal,
    optionsTotal: 0,
    customItems,
    discountRate,
    extraDiscount: requestedExtraDiscount,
    fixedTotal: request.fixedTotal,
    roundDownUnit: request.roundDownUnit,
    depositRate,
  });
  const fixedTotalIsDiscount = adjustmentProbe.specialAdjustmentAmount <= 0;
  const extraDiscount = fixedTotalIsDiscount
    ? requestedExtraDiscount + Math.abs(adjustmentProbe.specialAdjustmentAmount) + adjustmentProbe.roundDownAmount
    : requestedExtraDiscount;
  const totals = computeQuoteTotals({
    packageTotal,
    singleItemsTotal,
    optionsTotal: 0,
    customItems,
    discountRate,
    extraDiscount,
    // 공급가를 올리는 지정총액은 할인으로 표현할 수 없으므로 기존 명시 조정으로만 남긴다.
    // 대표가 지정한 금액을 조용히 다른 값으로 바꾸지 않는다.
    fixedTotal: fixedTotalIsDiscount ? null : request.fixedTotal,
    roundDownUnit: fixedTotalIsDiscount ? null : request.roundDownUnit,
    depositRate,
  });

  const formState = {
    brand,
    customer: {
      hospitalName: request.clientName || "", managerName: request.contactName || "", phone: request.phone || "", email: request.email || "",
      quoteDate: today(), validUntil: today(14), shootDate: "", quoteNumber: "",
    },
    quoteTitle: title,
    selectedPackageId,
    selectedSingleItemIds,
    singleItemNotes,
    singleItemAmounts,
    profileCount: 0, stagedCount: 0, combinedProfileStagedCount: 0, floorCount: 0, largeHospital: false, droneCount: 0,
    customItems,
    benefitItems,
    discount: request.discount ? { type: request.discount.type, value: request.discount.value } : null,
    discountLabel: request.discount?.label || "",
    discountRate,
    extraDiscount,
    fixedTotal: fixedTotalIsDiscount ? null : request.fixedTotal,
    roundDownUnit: fixedTotalIsDiscount ? null : request.roundDownUnit,
    memo: request.memo || "",
    depositRate,
    // 구조화된 단일항목/내용칸도 함께 채운다. 사람이 열어 수정해도 같은 폼 계산기로 이어진다.
    agentOverrideItems: false,
    source: "quote-request-parser",
  };

  return {
    hospitalName: request.clientName || "",
    clientId: input.clientId,
    workflowRunId: input.workflowRunId,
    contactName: request.contactName,
    phone: request.phone,
    email: request.email,
    quoteDate: today(),
    validUntil: today(14),
    title,
    packageId: selectedPackageId,
    items: canonicalItems,
    supplyAmount: totals.supplyAmount,
    discountAmount: totals.discountTotal,
    vat: totals.vat,
    totalAmount: totals.finalAmount,
    depositAmount: totals.depositAmount,
    balanceAmount: totals.balanceAmount,
    depositRate,
    memos: request.memo,
    formState,
    totals,
  };
}
