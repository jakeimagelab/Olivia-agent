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
  groupLabel?: string | null;
};

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

function hasBalancedParentheses(value: string) {
  let balance = 0;
  for (const character of value) {
    if (character === "(") balance += 1;
    if (character === ")") balance -= 1;
    if (balance < 0) return false;
  }
  return balance === 0;
}

export function titleForParsedQuote(request: ParsedQuoteRequest, brand: Brand) {
  const client = request.clientName?.trim();
  if (!client) throw new Error("견적서 제목을 만들 고객명을 원문에서 찾지 못했어요.");
  if (request.isEvent) {
    const eventTitle = [client, request.titleSuffix].filter(Boolean).join(" ").trim();
    const title = /견적서\s*$/i.test(eventTitle) ? eventTitle : `${eventTitle} 견적서`;
    if (!hasBalancedParentheses(title)) throw new Error("견적서 제목의 괄호 짝이 맞지 않아 저장하지 않았어요.");
    return title;
  }
  if (brand === "jakeimage") {
    const topic = titleTopic(request.items[0]);
    return `${client} 브랜드촬영${topic ? `(${topic})` : ""} 견적서`;
  }
  return `${client} 브랜드촬영 견적서`;
}

function detailOf(item: ParsedQuoteItem) {
  return [item.note ? `(${item.note})` : "", ...item.details].filter(Boolean).join("\n");
}

function toCustomItem(item: ParsedQuoteItem, index: number, brand: Brand): CustomItem {
  const amount = Math.max(0, Number(item.amount) || 0) * Math.max(1, item.quantity);
  return {
    id: `parsed:custom:${index}`,
    name: item.name,
    detail: detailOf(item),
    amount,
    unitPrice: item.amount ?? 0,
    quantity: Math.max(1, item.quantity),
    groupLabel: item.groupLabel,
    // 할인은 패키지·카탈로그 단일항목·인원 추가에만 적용한다. 사용자 임의 기타/묶음
    // 항목은 할인 대상에 억지로 넣지 않는다. 특히 "액자 추가 건"은 촬영비 검산 대상이 아니다.
    discountable: brand === "jakeimage"
      ? Boolean(jakeSingleId(item.name))
      : /(?:의료진\s*)?프로필\s*\d+\s*(?:명|인)?\s*추가/.test(item.name),
  };
}

function packageIdFor(items: ParsedQuoteItem[]) {
  return items
    .map((item) => packages.find((entry) => normalize(item.name).includes(normalize(entry.name)))?.id)
    .find((value): value is string => Boolean(value)) ?? null;
}

function benefitLabel(item: ParsedQuoteItem, hasPackage: boolean) {
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
      groupLabel: item.groupLabel,
    });

    if (item.free) {
      benefitItems.push({ id: `parsed:benefit:${index}`, name: benefitLabel(item, Boolean(selectedPackageId)) });
      return;
    }
    if (isPackage) return;
    // 포토클리닉 단일항목도 금액을 직접 말했으면 그 원문 금액을 우선한다. 고정 카탈로그
    // 버튼은 가격을 말하지 않았거나 정확히 같은 값일 때만 사용한다.
    if (brand === "jakeimage" && mappedId) {
      // 제이크이미지의 매핑은 체크 칸만 정한다. 문서/저장에 찍히는 항목명·수량·단가는
      // 원문 CustomItem으로 남긴다. 카탈로그 라벨로 바꾸면 안 된다.
      if (!selectedSingleItemIds.includes(mappedId)) selectedSingleItemIds.push(mappedId);
      customItems.push(toCustomItem(item, index, brand));
      return;
    }
    if (mappedId && (item.amount === null || item.amount === catalogPrice)) {
      if (!selectedSingleItemIds.includes(mappedId)) selectedSingleItemIds.push(mappedId);
      return;
    }
    customItems.push(toCustomItem(item, index, brand));
  });

  const packageTotal = selectedPackageId ? packages.find((entry) => entry.id === selectedPackageId)?.price ?? 0 : 0;
  const singleItemsTotal = brand === "jakeimage"
    ? 0
    : request.items
      .filter((item) => Boolean(photoclinicSingleId(item.name)) && !item.free)
      .reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0) * Math.max(1, item.quantity), 0);
  const discountRate = request.discount?.type === "percent" ? request.discount.value : 0;
  const requestedExtraDiscount = request.discount?.type === "amount" ? request.discount.value : 0;
  // 할인, 특별조정, 절삭은 모두 computeQuoteTotals 한 곳에서 순서대로 적용한다.
  // 이 값을 추가할인으로 합쳐 버리면 문서가 이미 반영한 공급가에서 할인을 또 빼는 것처럼 보인다.
  const extraDiscount = requestedExtraDiscount;
  const totals = computeQuoteTotals({
    packageTotal,
    singleItemsTotal,
    optionsTotal: 0,
    customItems,
    discountRate,
    extraDiscount,
    fixedTotal: request.fixedTotal,
    roundDownUnit: request.roundDownUnit,
    depositRate,
  });

  if (request.checkTotal !== null) {
    const discountedCatalogSubtotal = totals.discountableSubtotal - totals.discountTotal;
    if (request.checkTotal !== totals.supplyAmount && request.checkTotal !== discountedCatalogSubtotal) {
      throw new Error([
        "적어주신 금액과 계산이 안 맞아요.",
        `  적어주신 것:  ${request.checkTotal.toLocaleString("ko-KR")}`,
        `  계산한 것:    ${discountedCatalogSubtotal.toLocaleString("ko-KR")} (할인 적용 후)`,
        "어느 쪽이 맞나요?",
      ].join("\n"));
    }
  }

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
    fixedTotal: request.fixedTotal,
    roundDownUnit: request.roundDownUnit,
    checkTotal: request.checkTotal,
    specialAdjustmentAmount: totals.specialAdjustmentAmount,
    roundDownAmount: totals.roundDownAmount,
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
