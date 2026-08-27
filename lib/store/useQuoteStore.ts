import { create } from "zustand";
import type { Brand, BenefitItem, CustomItem, CustomerInfo } from "@/lib/quote/quoteFormTypes";
import { quoteRowToFormState } from "@/lib/quote/quoteRowMapping";

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

const QUOTE_FORM_KEYS = [
  "customer", "brand", "quoteTitle", "selectedPackageId", "selectedSingleItemIds",
  "singleItemAmounts", "profileCount", "stagedCount", "combinedProfileStagedCount",
  "floorCount", "largeHospital", "droneCount", "customItems", "benefitItems",
  "discountRate", "extraDiscount", "memo", "depositRate",
] as const satisfies readonly (keyof QuoteFormState)[];

type Updater<T> = T | ((prev: T) => T);

function resolveUpdater<T>(value: Updater<T>, prev: T): T {
  return typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
}

export type QuoteStoreState = QuoteFormState & {
  // 사람이 직접 건드린(퍼블릭 setter를 거친) 필드 이름 — Agent가 patchFromAgent로 들어와도
  // 이 안에 있는 필드는 값을 덮어쓰지 않는다(§45 미저장 편집 보호). resetForm()/loadRecentQuote()
  // 처럼 폼 전체를 새 기준선으로 교체하는 지점은 끝에서 clearDirty()를 호출해 dirtyFields를
  // 비운다 — "사람이 지금 편집 중"이 아니라 "새 기준선을 세우는 것"이기 때문이다.
  dirtyFields: Set<keyof QuoteFormState>;
  clearDirty: () => void;
  // Agent tool이 견적을 수정한 뒤 REFRESH_RESOURCE의 after payload(quotes 테이블 row)로
  // 들어온다. dirtyFields에 없는 필드만 서버 값으로 교체한다 — 사람이 지금 편집 중인 필드는
  // 그대로 두고, 나머지는 네트워크 왕복 없이 즉시 반영된다(Phase 3).
  patchFromAgent: (row: Record<string, unknown>) => void;

  // 지금 마운트된 QuoteBuilder 인스턴스가 등록해 둔 실제 downloadPdf() 콜백 — 사람이 누르는
  // 다운로드 버튼과 Agent(actionRouter.ts의 DOWNLOAD_QUOTE_PDF)가 정확히 같은 함수를
  // 호출하게 하려고 존재한다(Phase 4). 마운트된 화면이 없으면 null이고, 그 자체가 "지금
  // 열려 있는 견적서가 없다"는 신호다.
  pdfHandler: (() => Promise<{ success: boolean; error?: string }>) | null;
  registerPdfHandler: (fn: (() => Promise<{ success: boolean; error?: string }>) | null) => void;

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

export const useQuoteStore = create<QuoteStoreState>((set, get) => {
  // 값 하나를 set하면서 그 필드를 dirty로 표시하는 setter를 만든다 — human 쪽 JSX onChange와
  // resetForm()/loadRecentQuote() 안의 호출부가 정확히 같은 함수를 부르지만(마이그레이션 시
  // 변수명을 그대로 유지했다), 후자는 함수 끝에서 clearDirty()를 호출해 이 dirty 표시를
  // 지운다 — "폼 전체를 새 기준선으로 교체" vs "사람이 지금 이 필드를 편집" 둘 다 같은
  // setter를 쓰되, 그 차이는 clearDirty 호출 여부로 구분한다. create() 콜백의 set/get을
  // 클로저로 잡아써야 한다 — 정의 중인 useQuoteStore 자신을 참조하면 TS가 자기참조 추론에
  // 실패해 이 파일 전체와 QuoteBuilder.tsx 호출부까지 암묵적 any로 번진다.
  function dirtySetter<K extends keyof QuoteFormState>(key: K): (value: Updater<QuoteFormState[K]>) => void {
    return (value) =>
      set((state) => ({
        ...({ [key]: resolveUpdater(value, state[key]) } as Pick<QuoteFormState, K>),
        dirtyFields: new Set(state.dirtyFields).add(key),
      }));
  }

  return {
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
    dirtyFields: new Set(),
    pdfHandler: null,

    clearDirty: () => set({ dirtyFields: new Set() }),
    registerPdfHandler: (fn) => set({ pdfHandler: fn }),

    patchFromAgent: (row) => {
      const server = quoteRowToFormState(row);
      const { dirtyFields } = get();
      const patch: Partial<QuoteFormState> = {};
      for (const key of QUOTE_FORM_KEYS) {
        if (!dirtyFields.has(key)) (patch as Record<string, unknown>)[key] = server[key];
      }
      set(patch);
    },

    setCustomer: dirtySetter("customer"),
    setBrand: dirtySetter("brand"),
    setQuoteTitle: dirtySetter("quoteTitle"),
    setSelectedPackageId: dirtySetter("selectedPackageId"),
    setSelectedSingleItemIds: dirtySetter("selectedSingleItemIds"),
    setSingleItemAmounts: dirtySetter("singleItemAmounts"),
    setProfileCount: dirtySetter("profileCount"),
    setStagedCount: dirtySetter("stagedCount"),
    setCombinedProfileStagedCount: dirtySetter("combinedProfileStagedCount"),
    setFloorCount: dirtySetter("floorCount"),
    setLargeHospital: dirtySetter("largeHospital"),
    setDroneCount: dirtySetter("droneCount"),
    setCustomItems: dirtySetter("customItems"),
    setBenefitItems: dirtySetter("benefitItems"),
    setDiscountRate: dirtySetter("discountRate"),
    setExtraDiscount: dirtySetter("extraDiscount"),
    setMemo: dirtySetter("memo"),
    setDepositRate: dirtySetter("depositRate"),
  };
});
