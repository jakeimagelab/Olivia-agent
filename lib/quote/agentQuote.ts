import type { Brand } from "@/lib/quote/quoteFormTypes";
import { BRAND_CONFIG } from "@/lib/quote/quoteCatalog";

type QuoteLineItem = {
  id?: string;
  name: string;
  detail?: string;
  unitPrice: number;
  qty: number;
  subtotal: number;
  note?: string;
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

export function buildAgentQuoteData(input: Record<string, any>, workflowRunId?: string) {
  const packageId = String(input.packageId || "standard") as keyof typeof PACKAGE_CATALOG;
  const selected = PACKAGE_CATALOG[packageId] || PACKAGE_CATALOG.standard;
  const items: QuoteLineItem[] = [{
    id: `package:${packageId}`,
    name: selected.name,
    detail: selected.composition,
    unitPrice: selected.price,
    qty: 1,
    subtotal: selected.price,
    note: "촬영 패키지",
  }];
  if (Number(input.profileCount) > 0) {
    const qty = Number(input.profileCount);
    items.push({ id: "profile_shoot", name: "프로필 인원 추가", detail: `${qty}인`, unitPrice: 250_000, qty, subtotal: qty * 250_000, note: "추가 옵션" });
  }
  if (Number(input.stagedCount) > 0) {
    const qty = Number(input.stagedCount);
    items.push({ id: "staged_shoot", name: "연출 인원 추가", detail: `${qty}인`, unitPrice: 250_000, qty, subtotal: qty * 250_000, note: "추가 옵션" });
  }
  const amounts = calculateQuoteAmounts(items);
  return {
    hospitalName: String(input.hospitalName || "").trim(),
    contactName: input.contactName,
    phone: input.phone,
    email: input.email,
    shootDate: input.shootDate,
    quoteDate: dateInSeoul(),
    validUntil: dateInSeoul(14),
    title: "포토클리닉 브랜드사진 견적서",
    items,
    ...amounts,
    depositRate: 50,
    memos: input.memo || null,
    workflowRunId,
    formState: { selectedPackageId: packageId, profileCount: Number(input.profileCount) || 0, stagedCount: Number(input.stagedCount) || 0, source: "olivia-v2" },
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
