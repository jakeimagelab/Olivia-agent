import type { Brand } from "@/lib/quote/quoteFormTypes";
import { BRAND_CONFIG } from "@/lib/quote/quoteCatalog";
import { parseKoreanCount, parseKoreanMoney } from "@/lib/olivia/naturalLanguageNumbers";

type QuoteLineItem = {
  id?: string;
  name: string;
  detail?: string;
  unitPrice: number;
  qty: number;
  subtotal: number;
  note?: string;
};

type AgentExtraItem = { name?: unknown; detail?: unknown; amount?: unknown; quantity?: unknown };

export type QuotePricingMode = "package" | "custom_unit" | "custom_total";

export type QuoteIncludedService = {
  type: "profile" | "staged" | "group" | "interior" | "video" | "other";
  label: string;
  personCount?: number | null;
  cutCount?: number | null;
  conceptCount?: number | null;
  deliverableCount?: number | null;
  description?: string | null;
};

export type QuoteIntent = {
  hospitalName: string;
  title?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  pricingMode: QuotePricingMode;
  packageId?: string | null;
  pricing?: {
    quantity?: number | null;
    unitPrice?: number | null;
    totalPrice?: number | null;
    unitLabel?: string | null;
  };
  discount?: { type: "percent" | "amount"; value: number } | null;
  includedServices?: QuoteIncludedService[];
  memo?: string | null;
};

function resolveBrand(value: unknown): Brand {
  return value === "jakeimage" ? "jakeimage" : "photoclinic";
}

const PACKAGE_CATALOG = {
  standard: { name: "스탠다드 패키지", price: 1_350_000, composition: "프로필 + 연출사진" },
  premium: { name: "프리미엄 패키지", price: 2_000_000, composition: "프로필 + 연출사진 + 인테리어" },
  "premium-plus-1": { name: "프리미엄 플러스 1 패키지", price: 3_600_000, composition: "프로필 + 연출사진 + 인테리어 + 포인트영상" },
  "premium-plus-2": { name: "프리미엄 플러스 2 패키지", price: 4_500_000, composition: "프로필 + 연출사진 + 인테리어 + 브랜드필름" },
} as const;

const INCLUDED_SERVICE_TYPES = new Set<QuoteIncludedService["type"]>([
  "profile", "staged", "group", "interior", "video", "other",
]);

function optionalCount(value: unknown) {
  if (value == null || value === "") return null;
  return parseKoreanCount(value as string | number) ?? null;
}

function optionalMoney(value: unknown) {
  if (value == null || value === "") return null;
  return parseKoreanMoney(value as string | number) ?? null;
}

function pricingInput(input: Record<string, any>) {
  const nested = input.pricing && typeof input.pricing === "object" ? input.pricing : {};
  return {
    quantity: optionalCount(input.customQuantity ?? nested.quantity),
    unitPrice: optionalMoney(input.customUnitPrice ?? nested.unitPrice),
    totalPrice: optionalMoney(input.customTotalPrice ?? nested.totalPrice),
    unitLabel: String(input.unitLabel ?? nested.unitLabel ?? "명").trim() || "명",
  };
}

export function hasExplicitPackageWording(value: unknown) {
  return typeof value === "string" && /패키지/.test(value);
}

export function resolveQuotePricingMode(input: Record<string, any>, requestText?: string): QuotePricingMode {
  const pricing = pricingInput(input);
  const hasRequestText = typeof requestText === "string" && Boolean(requestText.trim());
  if (hasRequestText) {
    if (hasExplicitPackageWording(requestText)) return "package";
    if (pricing.quantity && pricing.unitPrice) return "custom_unit";
    return input.pricingMode === "custom_unit" ? "custom_unit" : "custom_total";
  }
  if (input.pricingMode === "package" || input.pricingMode === "custom_unit" || input.pricingMode === "custom_total") {
    return input.pricingMode;
  }
  // 하위 호환: 폼/기존 테스트처럼 packageId를 구조화해 직접 호출한 경우만 package로 본다.
  // 자연어 요청은 requestText가 항상 전달되므로 이 경로에서 standard가 자동 선택되지 않는다.
  if (input.packageId) return "package";
  return pricing.quantity && pricing.unitPrice ? "custom_unit" : "custom_total";
}

function normalizeIncludedServices(input: Record<string, any>): QuoteIncludedService[] {
  const structured = Array.isArray(input.includedServices) ? input.includedServices : [];
  const normalized = structured.flatMap((raw): QuoteIncludedService[] => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const type = INCLUDED_SERVICE_TYPES.has(item.type as QuoteIncludedService["type"])
      ? item.type as QuoteIncludedService["type"]
      : "other";
    const label = String(item.label || "").trim();
    if (!label) return [];
    return [{
      type,
      label,
      personCount: optionalCount(item.personCount),
      cutCount: optionalCount(item.cutCount),
      conceptCount: optionalCount(item.conceptCount),
      deliverableCount: optionalCount(item.deliverableCount),
      description: item.description == null ? null : String(item.description).trim() || null,
    }];
  });
  const legacy = (Array.isArray(input.serviceItems) ? input.serviceItems : [])
    .map((item): QuoteIncludedService => ({ type: "other", label: String(item || "").trim() }))
    .filter((item) => Boolean(item.label));
  return [...normalized, ...legacy];
}

export function formatIncludedService(service: QuoteIncludedService) {
  const label = service.label.trim();
  const suffixes: string[] = [];
  if (service.personCount && !new RegExp(`${service.personCount}\\s*(?:명|인)`).test(label)) suffixes.push(`${service.personCount}명`);
  if (service.cutCount && !new RegExp(`${service.cutCount}\\s*컷`).test(label)) suffixes.push(`${service.cutCount}컷`);
  if (service.conceptCount && !new RegExp(`${service.conceptCount}\\s*컨셉`).test(label)) suffixes.push(`${service.conceptCount}컨셉`);
  if (service.deliverableCount && !new RegExp(`${service.deliverableCount}\\s*장`).test(label)) {
    suffixes.push(`${service.conceptCount ? "/ 약 " : "약 "}${service.deliverableCount}장`);
  }
  return [label, suffixes.join(" "), service.description || ""].filter(Boolean).join(" ").replace(/\s+\/\s+/g, " / ");
}

function discountInput(input: Record<string, any>) {
  const nested = input.discount && typeof input.discount === "object" ? input.discount as Record<string, unknown> : null;
  if (nested?.type === "percent") return { type: "percent" as const, value: Math.min(100, Math.max(0, Number(nested.value) || 0)) };
  if (nested?.type === "amount") return { type: "amount" as const, value: optionalMoney(nested.value) || 0 };
  if (input.discountPercent != null || input.discountRate != null) {
    return { type: "percent" as const, value: Math.min(100, Math.max(0, Number(input.discountPercent ?? input.discountRate) || 0)) };
  }
  if (input.discountAmount != null) return { type: "amount" as const, value: optionalMoney(input.discountAmount) || 0 };
  return null;
}

function dateInSeoul(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
}
export function calculateQuoteAmounts(items: QuoteLineItem[], discountAmount = 0, depositRate = 50) {
  const gross = items.reduce((sum, item) => sum + Math.max(0, Number(item.subtotal) || 0), 0);
  const totalAmount = Math.max(0, gross - Math.max(0, discountAmount));
  const supplyAmount = Math.round(totalAmount / 1.1);
  const vat = totalAmount - supplyAmount;
  const depositAmount = Math.round(totalAmount * depositRate / 100);
  return { supplyAmount, vat, totalAmount, depositAmount, balanceAmount: totalAmount - depositAmount };
}

export function buildAgentQuoteData(input: Record<string, any>, workflowRunId?: string, currentRequestText?: string) {
  const brand = resolveBrand(input.brand);
  const requestText = currentRequestText || (typeof input.sourceText === "string" ? input.sourceText : undefined);
  const pricingMode = resolveQuotePricingMode(input, requestText);
  const pricing = pricingInput(input);
  const packageId = input.packageId ? String(input.packageId) as keyof typeof PACKAGE_CATALOG : null;
  const items: QuoteLineItem[] = [];

  if (pricingMode === "package") {
    const selected = packageId ? PACKAGE_CATALOG[packageId] : undefined;
    if (!selected) throw new Error("사용할 패키지 종류를 알려주세요. 패키지를 임의로 선택하지 않을게요.");
    items.push({ id: `package:${packageId}`, name: selected.name, detail: selected.composition, unitPrice: selected.price, qty: 1, subtotal: selected.price, note: "촬영 패키지" });
    if (Number(input.profileCount) > 0) {
      const qty = Number(input.profileCount);
      items.push({ id: "profile_shoot", name: "프로필 인원 추가", detail: `${qty}인`, unitPrice: 250_000, qty, subtotal: qty * 250_000, note: "추가 옵션" });
    }
    if (Number(input.stagedCount) > 0) {
      const qty = Number(input.stagedCount);
      items.push({ id: "staged_shoot", name: "연출 인원 추가", detail: `${qty}인`, unitPrice: 250_000, qty, subtotal: qty * 250_000, note: "추가 옵션" });
    }
  } else if (pricingMode === "custom_unit") {
    if (!pricing.quantity || !pricing.unitPrice) throw new Error("맞춤 견적의 인원과 인당 금액을 확인해주세요.");
    items.push({
      id: "custom:primary",
      name: String(input.primaryLineLabel || "브랜드 촬영").trim() || "브랜드 촬영",
      detail: `${pricing.quantity}${pricing.unitLabel} × ${pricing.unitPrice.toLocaleString("ko-KR")}원`,
      unitPrice: pricing.unitPrice,
      qty: pricing.quantity,
      subtotal: pricing.quantity * pricing.unitPrice,
      note: "맞춤 견적",
    });
  } else {
    const totalPrice = pricing.totalPrice;
    if (!totalPrice) throw new Error("맞춤 견적의 총액을 확인해주세요.");
    items.push({
      id: "custom:primary",
      name: String(input.primaryLineLabel || "브랜드 촬영").trim() || "브랜드 촬영",
      detail: pricing.quantity && pricing.unitPrice ? `${pricing.quantity}${pricing.unitLabel} × ${pricing.unitPrice.toLocaleString("ko-KR")}원` : "",
      unitPrice: totalPrice,
      qty: 1,
      subtotal: totalPrice,
      note: "맞춤 총액",
    });
  }
  const customItems = (Array.isArray(input.extraItems) ? input.extraItems : []) as AgentExtraItem[];
  customItems.forEach((item, index) => {
    const amount = Math.max(0, Number(item.amount) || 0);
    const qty = Math.max(1, Number(item.quantity) || 1);
    const name = String(item.name || "추가 항목").trim();
    items.push({ id: `custom:${index}:${name}`, name, detail: String(item.detail || ""), unitPrice: amount, qty, subtotal: amount * qty, note: "추가 항목" });
  });
  const includedServices = normalizeIncludedServices(input);
  const structuredServiceCount = (Array.isArray(input.includedServices) ? input.includedServices : [])
    .filter((item: unknown) => item && typeof item === "object" && !Array.isArray(item) && String((item as Record<string, unknown>).label || "").trim())
    .length;
  includedServices.forEach((service, index) => {
    const name = formatIncludedService(service);
    items.push({ id: `service:${service.type}:${index}`, name, detail: "", unitPrice: 0, qty: 1, subtotal: 0, note: index < structuredServiceCount ? "포함 서비스" : "서비스" });
  });
  const discount = discountInput(input);
  const gross = items.reduce((sum, item) => sum + item.subtotal, 0);
  const discountAmount = discount?.type === "percent"
    ? Math.round(gross * discount.value / 100)
    : Math.min(gross, discount?.value || 0);

  if (pricingMode === "custom_unit" && pricing.quantity && pricing.unitPrice && pricing.totalPrice) {
    const finalAfterDiscount = gross - discountAmount;
    if (pricing.totalPrice !== gross && pricing.totalPrice !== finalAfterDiscount) {
      throw new Error(`${pricing.quantity}명 × ${pricing.unitPrice.toLocaleString("ko-KR")}원이면 ${gross.toLocaleString("ko-KR")}원인데, 총액은 ${pricing.totalPrice.toLocaleString("ko-KR")}원으로 말씀하셨어요. 어느 금액을 적용할지 확인해주세요.`);
    }
  }
  const amounts = calculateQuoteAmounts(items, discountAmount);
  const quoteDate = dateInSeoul();
  const validUntil = dateInSeoul(14);
  const optional = Object.fromEntries(Object.entries({
    shootDate: input.shootDate,
    memos: input.memo,
    workflowRunId,
  }).filter(([, value]) => value !== null && value !== undefined));
  const title = String(input.title || "").trim() || BRAND_CONFIG[brand].defaultQuoteTitle;
  const contactFields = {
    contactName: input.contactName == null ? null : String(input.contactName).trim() || null,
    phone: input.phone == null ? null : String(input.phone).trim() || null,
    email: input.email == null ? null : String(input.email).trim() || null,
  };
  return {
    hospitalName: String(input.hospitalName || "").trim(),
    ...contactFields,
    ...optional,
    quoteDate,
    validUntil,
    title,
    packageId: pricingMode === "package" ? packageId : null,
    items,
    ...amounts,
    discountAmount,
    depositRate: 50,
    formState: {
      brand,
      customer: {
        hospitalName: String(input.hospitalName || "").trim(),
        managerName: String(input.contactName || ""),
        phone: String(input.phone || ""),
        email: String(input.email || ""),
        quoteDate,
        validUntil,
        shootDate: String(input.shootDate || ""),
      },
      quoteTitle: title,
      selectedPackageId: pricingMode === "package" ? packageId : null,
      selectedSingleItemIds: [],
      singleItemAmounts: {},
      profileCount: pricingMode === "package" ? Number(input.profileCount) || 0 : 0,
      stagedCount: pricingMode === "package" ? Number(input.stagedCount) || 0 : 0,
      combinedProfileStagedCount: 0,
      floorCount: 0,
      largeHospital: false,
      droneCount: 0,
      customItems: customItems.map((item, index) => ({ id: `custom:${index}`, name: String(item.name || "추가 항목"), detail: String(item.detail || ""), amount: Math.max(0, Number(item.amount) || 0) })),
      benefitItems: includedServices.map((service, index) => ({ id: `service:${service.type}:${index}`, name: formatIncludedService(service) })),
      // CUSTOM의 주 가격 행은 기존 폼 카탈로그에서 다시 만들 수 없으므로 canonical
      // items[]를 화면에서도 그대로 사용한다. PACKAGE는 기존 구조화 폼을 유지한다.
      agentOverrideItems: pricingMode !== "package",
      pricingMode,
      pricing,
      includedServices,
      discount,
      discountRate: discount?.type === "percent" ? discount.value : 0,
      extraDiscount: discount?.type === "amount" ? discount.value : 0,
      memo: String(input.memo || ""),
      depositRate: 50,
      vatMode: "included",
      source: "olivia-v2",
    },
  };
}

function normalized(value: unknown) {
  return String(value || "").toLowerCase().replace(/[\s/_-]+/g, "");
}

export function updateQuoteItemPrice(itemsValue: unknown, selector: string, rawAmount: number) {
  const items = Array.isArray(itemsValue) ? itemsValue.map((item) => ({ ...item })) as QuoteLineItem[] : [];
  const query = normalized(selector);
  const matches = items.filter((item) => {
    const target = `${normalized(item.id)}${normalized(item.name)}${normalized(item.detail)}`;
    return target.includes(query) || (query.includes("프로필") && target.includes("프로필"));
  });
  if (matches.length !== 1) return { items, matches: matches.map((item) => ({ id: item.id, name: item.name })) };
  const amount = rawAmount > 0 && rawAmount < 10_000 ? rawAmount * 10_000 : rawAmount;
  const targetId = matches[0].id;
  const next = items.map((item) => item === matches[0] || (targetId && item.id === targetId)
    ? { ...item, unitPrice: amount, subtotal: amount * Math.max(1, Number(item.qty) || 1) }
    : item);
  return { items: next, matches: [{ id: matches[0].id, name: matches[0].name }], amount };
}
