import { create } from "zustand";
import type { Brand, BenefitItem, CustomItem, CustomerInfo } from "@/lib/quote/quoteFormTypes";

// 현재 열려 있는 견적서 하나의 폼 상태 — QuoteBuilder.tsx(Form/Preview, 같은 상태 트리를
// 그대로 공유)와 Olivia Agent(actionRouter.ts를 통한 실시간 patch, Phase 3)가 함께 읽고 쓴다.
// QuoteBuilder는 /photoclinic(page 모드)와 고객관리 Workspace Modal(modal 모드) 중 한 번에
// 하나만 마운트되므로(동시 마운트 경로 없음, 2026-08-27 확인) keyed record가 아니라 "현재 연
// 견적 하나"를 표현하는 단일 슬라이스로 둔다.
export type QuoteFormState = {
  customer: CustomerInfo;
  brand: Brand;
  quoteTitle: string;
  selectedPackageId: string | null;
  selectedSingleItemIds: string[];
  singleItemAmounts: Record<string, number>;
  profileCount: number;
  stagedCount: number;
  combinedProfileStagedCount: number;
  floorCount: number;
  largeHospital: boolean;
  droneCount: number;
  customItems: CustomItem[];
  benefitItems: BenefitItem[];
  discountRate: number;
  extraDiscount: number;
  memo: string;
  depositRate: number;
};

type Updater<T> = T | ((prev: T) => T);

function resolveUpdater<T>(value: Updater<T>, prev: T): T {
  return typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
}

export type QuoteStoreState = QuoteFormState & {
  setCustomer: (value: Updater<CustomerInfo>) => void;
  setBrand: (value: Updater<Brand>) => void;
  setQuoteTitle: (value: Updater<string>) => void;
  setSelectedPackageId: (value: Updater<string | null>) => void;
  setSelectedSingleItemIds: (value: Updater<string[]>) => void;
  setSingleItemAmounts: (value: Updater<Record<string, number>>) => void;
  setProfileCount: (value: Updater<number>) => void;
  setStagedCount: (value: Updater<number>) => void;
  setCombinedProfileStagedCount: (value: Updater<number>) => void;
  setFloorCount: (value: Updater<number>) => void;
  setLargeHospital: (value: Updater<boolean>) => void;
  setDroneCount: (value: Updater<number>) => void;
  setCustomItems: (value: Updater<CustomItem[]>) => void;
  setBenefitItems: (value: Updater<BenefitItem[]>) => void;
  setDiscountRate: (value: Updater<number>) => void;
  setExtraDiscount: (value: Updater<number>) => void;
  setMemo: (value: Updater<string>) => void;
  setDepositRate: (value: Updater<number>) => void;
};

// 모듈 로드 시점의 자리표시자 값 — 실제로 화면에 보이는 일은 없다(QuoteBuilder가 마운트될
// 때마다 useLayoutEffect로 resetForm()을 호출해 paint 전에 항상 덮어쓴다). 그래서 여기서는
// initialCustomer()/BRAND_CONFIG 같은 컴포넌트 쪽 로직을 끌어올 필요가 없다 — 끌어오면 store가
// QuoteBuilder.tsx에 역의존하게 되어 순환 참조가 생긴다.
const emptyCustomer = (): CustomerInfo => ({
  hospitalName: "",
  managerName: "",
  phone: "",
  email: "",
  quoteDate: "",
  validUntil: "",
  shootDate: "",
  quoteNumber: "",
});

export const useQuoteStore = create<QuoteStoreState>((set) => ({
  customer: emptyCustomer(),
  brand: "photoclinic",
  quoteTitle: "",
  selectedPackageId: null,
  selectedSingleItemIds: [],
  singleItemAmounts: {},
  profileCount: 0,
  stagedCount: 0,
  combinedProfileStagedCount: 0,
  floorCount: 0,
  largeHospital: false,
  droneCount: 0,
  customItems: [],
  benefitItems: [],
  discountRate: 0,
  extraDiscount: 0,
  memo: "",
  depositRate: 50,

  setCustomer: (value) => set((state) => ({ customer: resolveUpdater(value, state.customer) })),
  setBrand: (value) => set((state) => ({ brand: resolveUpdater(value, state.brand) })),
  setQuoteTitle: (value) => set((state) => ({ quoteTitle: resolveUpdater(value, state.quoteTitle) })),
  setSelectedPackageId: (value) => set((state) => ({ selectedPackageId: resolveUpdater(value, state.selectedPackageId) })),
  setSelectedSingleItemIds: (value) => set((state) => ({ selectedSingleItemIds: resolveUpdater(value, state.selectedSingleItemIds) })),
  setSingleItemAmounts: (value) => set((state) => ({ singleItemAmounts: resolveUpdater(value, state.singleItemAmounts) })),
  setProfileCount: (value) => set((state) => ({ profileCount: resolveUpdater(value, state.profileCount) })),
  setStagedCount: (value) => set((state) => ({ stagedCount: resolveUpdater(value, state.stagedCount) })),
  setCombinedProfileStagedCount: (value) => set((state) => ({ combinedProfileStagedCount: resolveUpdater(value, state.combinedProfileStagedCount) })),
  setFloorCount: (value) => set((state) => ({ floorCount: resolveUpdater(value, state.floorCount) })),
  setLargeHospital: (value) => set((state) => ({ largeHospital: resolveUpdater(value, state.largeHospital) })),
  setDroneCount: (value) => set((state) => ({ droneCount: resolveUpdater(value, state.droneCount) })),
  setCustomItems: (value) => set((state) => ({ customItems: resolveUpdater(value, state.customItems) })),
  setBenefitItems: (value) => set((state) => ({ benefitItems: resolveUpdater(value, state.benefitItems) })),
  setDiscountRate: (value) => set((state) => ({ discountRate: resolveUpdater(value, state.discountRate) })),
  setExtraDiscount: (value) => set((state) => ({ extraDiscount: resolveUpdater(value, state.extraDiscount) })),
  setMemo: (value) => set((state) => ({ memo: resolveUpdater(value, state.memo) })),
  setDepositRate: (value) => set((state) => ({ depositRate: resolveUpdater(value, state.depositRate) })),
}));
