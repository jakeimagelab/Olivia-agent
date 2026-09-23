import { BRAND_CONFIG, getSingleItems, packages } from "@/lib/quote/quoteCatalog";
import { computeQuoteTotals } from "@/lib/quote/computeQuoteTotals";
import type { BenefitItem, Brand, CustomItem, CustomerInfo } from "@/lib/quote/quoteFormTypes";
import { quoteRowToFormState } from "@/lib/quote/quoteRowMapping";

export type QuoteDocumentLine = {
  id: string;
  name: string;
  detail?: string;
  amount: number;
};

export type QuoteDocumentData = {
  brand: Brand;
  customer: CustomerInfo;
  quoteTitle: string;
  packageItem: QuoteDocumentLine | null;
  singleItems: QuoteDocumentLine[];
  optionItems: QuoteDocumentLine[];
  customItems: CustomItem[];
  benefitItems: BenefitItem[];
  discountRate: number;
  rateDiscountAmount: number;
  extraDiscountAmount: number;
  discountTotal: number;
  contentSubtotal: number;
  supplyAmount: number;
  vat: number;
  finalAmount: number;
  depositRate: number;
  memo: string;
};

function optionLines(
  state: ReturnType<typeof quoteRowToFormState>,
  largeScaleLabel: string,
): QuoteDocumentLine[] {
  return [
    { id: "profile_shoot", name: "프로필 인원 추가", detail: `${state.profileCount}인`, amount: state.profileCount * 250000, visible: state.profileCount > 0 },
    { id: "staged_shoot", name: "연출 인원 추가", detail: `${state.stagedCount}인`, amount: state.stagedCount * 450000, visible: state.stagedCount > 0 },
    { id: "combined_profile_staged", name: "프로필/연출 추가", detail: `${state.combinedProfileStagedCount}인`, amount: state.combinedProfileStagedCount * 650000, visible: state.combinedProfileStagedCount > 0 },
    { id: "floor_shoot", name: "인테리어 층수 추가", detail: `${state.floorCount}층`, amount: state.floorCount * 250000, visible: state.floorCount > 0 },
    { id: "large_hospital", name: largeScaleLabel, detail: "적용", amount: 750000, visible: state.largeHospital },
    { id: "drone_shoot", name: "드론촬영", detail: `${state.droneCount}회`, amount: state.droneCount * 500000, visible: state.droneCount > 0 },
  ].filter((item) => item.visible).map((item) => ({
    id: item.id,
    name: item.name,
    detail: item.detail,
    amount: item.amount,
  }));
}

/** Converts a canonical quotes row into the exact view model used by QuoteDocument. */
export function quoteDocumentDataFromRow(row: Record<string, unknown>): QuoteDocumentData {
  const state = quoteRowToFormState(row);
  const cfg = BRAND_CONFIG[state.brand];
  const packageItem = packages.find((item) => item.id === state.selectedPackageId);
  const selectedSingles = getSingleItems(state.brand).filter((item) => state.selectedSingleItemIds.includes(item.id));
  const singleLines = selectedSingles.map((item) => ({
    id: item.id,
    name: item.name,
    amount: state.brand === "jakeimage" ? 0 : item.price,
    detail: state.brand === "jakeimage" ? state.singleItemNotes[item.id] : undefined,
  }));
  const options = optionLines(state, cfg.largeScaleLabel);
  const customItems = state.customItems.filter((item) => item.name || item.detail || item.amount > 0);
  const benefitItems = state.benefitItems.filter((item) => item.name);
  const totals = computeQuoteTotals({
    packageTotal: packageItem?.price ?? 0,
    singleItemsTotal: singleLines.reduce((sum, item) => sum + item.amount, 0),
    optionsTotal: options.reduce((sum, item) => sum + item.amount, 0),
    customItems,
    discountRate: state.discountRate,
    extraDiscount: state.extraDiscount,
  });

  return {
    brand: state.brand,
    customer: state.customer,
    quoteTitle: state.quoteTitle || String(row.title || ""),
    packageItem: packageItem
      ? { id: packageItem.id, name: packageItem.name, detail: packageItem.composition, amount: packageItem.price }
      : null,
    singleItems: singleLines,
    optionItems: options,
    customItems,
    benefitItems,
    discountRate: state.discountRate,
    rateDiscountAmount: totals.rateDiscountAmount,
    extraDiscountAmount: totals.extraDiscountAmount,
    discountTotal: totals.discountTotal,
    contentSubtotal: totals.contentSubtotal,
    supplyAmount: totals.supplyAmount,
    vat: totals.vat,
    finalAmount: totals.finalAmount,
    depositRate: state.depositRate,
    memo: state.memo,
  };
}
