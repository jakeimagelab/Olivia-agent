import type { Brand, BenefitItem, CustomItem, CustomerInfo } from "@/lib/quote/quoteFormTypes";
import type { QuoteFormState } from "@/lib/store/useQuoteStore";

type QuoteRow = Record<string, any>;

// toolExecutor.ts의 견적 mutation tool은 saveQuote()가 반환한 DB row(quotes 테이블 전체
// 컬럼)를 REFRESH_RESOURCE 액션의 after payload로 그대로 보낸다. 그 row를 폼 상태로 바꾸는
// 규칙은 components/quote/QuoteBuilder.tsx의 loadRecentQuote()가 이미 갖고 있다 —
// form_state.agentOverrideItems가 서 있으면(견적 항목 tool이 방금 items[]를 직접 바꿨다는
// 뜻) 구조화된 package/인원수 선택은 더 이상 실제 구성을 반영하지 못하므로 items[]를
// customItems/benefitItems로 펼쳐서 되돌린다. useQuoteStore.patchFromAgent(Phase 3)이
// 실시간 patch에도 같은 규칙을 쓰기 위해 순수 함수로 분리했다 — loadRecentQuote() 자체는
// (전체 폼 재구성이라는 다른 용도라) 그대로 두고 건드리지 않는다.
export function quoteRowToFormState(row: QuoteRow): QuoteFormState {
  const formState = row.form_state && typeof row.form_state === "object" ? (row.form_state as Record<string, any>) : undefined;
  const items = Array.isArray(row.items) ? row.items : [];

  if (formState && !formState.agentOverrideItems) {
    return {
      customer: formState.customer ?? {
        hospitalName: row.hospital_name || "",
        managerName: row.contact_name || "",
        phone: row.phone || "",
        email: row.email || "",
        quoteDate: row.quote_date || "",
        validUntil: row.valid_until || "",
        shootDate: row.shoot_date || "",
        quoteNumber: row.quote_number || "",
      },
      brand: (formState.brand ?? "photoclinic") as Brand,
      quoteTitle: formState.quoteTitle ?? "",
      selectedPackageId: formState.selectedPackageId ?? null,
      selectedSingleItemIds: formState.selectedSingleItemIds ?? [],
      singleItemAmounts: formState.singleItemAmounts ?? {},
      profileCount: formState.profileCount ?? 0,
      stagedCount: formState.stagedCount ?? 0,
      combinedProfileStagedCount: formState.combinedProfileStagedCount ?? 0,
      floorCount: formState.floorCount ?? 0,
      largeHospital: Boolean(formState.largeHospital),
      droneCount: formState.droneCount ?? 0,
      customItems: formState.customItems ?? [],
      benefitItems: formState.benefitItems ?? [],
      discountRate: formState.discountRate ?? 0,
      extraDiscount: formState.extraDiscount ?? 0,
      memo: formState.memo ?? "",
      depositRate: formState.depositRate ?? 50,
    };
  }

  const customItems: CustomItem[] = items
    .filter((item: any) => Number(item.subtotal) > 0)
    .map((item: any) => ({ id: item.id || crypto.randomUUID(), name: item.name, detail: item.detail, amount: item.subtotal }));
  const benefitItems: BenefitItem[] = items
    .filter((item: any) => Number(item.subtotal) === 0)
    .map((item: any) => ({ id: item.id || crypto.randomUUID(), name: item.name }));

  const customer: CustomerInfo = {
    hospitalName: row.hospital_name || "",
    managerName: row.contact_name || "",
    phone: row.phone || "",
    email: row.email || "",
    quoteDate: row.quote_date || "",
    validUntil: row.valid_until || "",
    shootDate: row.shoot_date || "",
    quoteNumber: row.quote_number || "",
  };

  return {
    customer,
    brand: "photoclinic",
    quoteTitle: row.title || "",
    selectedPackageId: null,
    selectedSingleItemIds: [],
    singleItemAmounts: {},
    profileCount: 0,
    stagedCount: 0,
    combinedProfileStagedCount: 0,
    floorCount: 0,
    largeHospital: false,
    droneCount: 0,
    customItems,
    benefitItems,
    discountRate: 0,
    extraDiscount: Number(row.discount_amount) || 0,
    memo: row.memos || "",
    depositRate: formState?.depositRate ?? 50,
  };
}
