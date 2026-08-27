import { beforeEach, describe, expect, it } from "vitest";
import { useQuoteStore } from "@/lib/store/useQuoteStore";
import { quoteRowToFormState } from "@/lib/quote/quoteRowMapping";

const baseCustomer = {
  hospitalName: "히어산부인과", managerName: "담당자", phone: "", email: "",
  quoteDate: "2026-08-27", validUntil: "2026-09-10", shootDate: "", quoteNumber: "PC-20260827-001",
};

function structuredRow(overrides: Record<string, any> = {}) {
  return {
    id: "quote-1",
    hospital_name: "히어산부인과",
    items: [{ id: "profile_shoot", name: "프로필촬영", subtotal: 300_000 }],
    memos: "기존 메모",
    discount_amount: 0,
    form_state: {
      customer: baseCustomer,
      brand: "photoclinic",
      quoteTitle: "견적서",
      selectedPackageId: "standard",
      selectedSingleItemIds: [],
      singleItemAmounts: {},
      profileCount: 0, stagedCount: 0, combinedProfileStagedCount: 0, floorCount: 0,
      largeHospital: false, droneCount: 0,
      customItems: [], benefitItems: [],
      discountRate: 0, extraDiscount: 0,
      memo: "기존 메모",
      depositRate: 50,
    },
    ...overrides,
  };
}

// Phase 3의 핵심 규칙: Agent가 견적을 수정한 뒤 REFRESH_RESOURCE의 after(DB row)로
// useQuoteStore.patchFromAgent가 호출된다 — 사람이 지금 편집 중인(dirty) 필드는 절대
// 덮어쓰지 않고, 나머지는 즉시 반영한다. loadRecentQuote()의 "전체 폼 덮어쓰기" 버그를
// 필드 단위 patch로 대체한 것이 이 테스트가 지키는 계약이다.
describe("quoteRowToFormState", () => {
  it("agentOverrideItems가 없으면 구조화된 formState를 그대로 쓴다", () => {
    const state = quoteRowToFormState(structuredRow());
    expect(state.selectedPackageId).toBe("standard");
    expect(state.customer.hospitalName).toBe("히어산부인과");
  });

  it("agentOverrideItems가 서 있으면 items[]를 customItems/benefitItems로 펼치고 패키지/인원수를 0으로 되돌린다", () => {
    const row = structuredRow({
      items: [{ id: "a", name: "영상촬영", subtotal: 500_000 }, { id: "b", name: "액자 서비스", subtotal: 0 }],
      form_state: { ...structuredRow().form_state, agentOverrideItems: true },
    });
    const state = quoteRowToFormState(row);
    expect(state.selectedPackageId).toBeNull();
    expect(state.customItems).toEqual([{ id: "a", name: "영상촬영", detail: undefined, amount: 500_000 }]);
    expect(state.benefitItems).toEqual([{ id: "b", name: "액자 서비스" }]);
  });
});

describe("useQuoteStore.patchFromAgent", () => {
  beforeEach(() => {
    useQuoteStore.setState({
      customer: baseCustomer,
      brand: "photoclinic",
      quoteTitle: "견적서",
      selectedPackageId: "standard",
      selectedSingleItemIds: [],
      singleItemAmounts: {},
      profileCount: 0, stagedCount: 0, combinedProfileStagedCount: 0, floorCount: 0,
      largeHospital: false, droneCount: 0,
      customItems: [], benefitItems: [],
      discountRate: 0, extraDiscount: 0,
      memo: "기존 메모",
      depositRate: 50,
      dirtyFields: new Set(),
    });
  });

  it("dirty하지 않은 필드는 서버 값으로 즉시 patch된다", () => {
    useQuoteStore.getState().patchFromAgent(structuredRow({ memos: "Agent가 바꾼 메모", form_state: { ...structuredRow().form_state, memo: "Agent가 바꾼 메모" } }));
    expect(useQuoteStore.getState().memo).toBe("Agent가 바꾼 메모");
  });

  it("사람이 지금 편집 중인(dirty) 필드는 Agent patch로도 덮어쓰지 않는다", () => {
    useQuoteStore.getState().setMemo("사람이 입력 중인 메모");
    expect(useQuoteStore.getState().dirtyFields.has("memo")).toBe(true);

    useQuoteStore.getState().patchFromAgent(structuredRow({ memos: "Agent가 바꾼 메모", form_state: { ...structuredRow().form_state, memo: "Agent가 바꾼 메모" } }));

    expect(useQuoteStore.getState().memo).toBe("사람이 입력 중인 메모");
  });

  it("dirty한 필드는 그대로 두고 나머지 필드는 patch한다(부분 덮어쓰기, 전체 폼 clobber 아님)", () => {
    useQuoteStore.getState().setCustomItems([{ id: "human-edit", name: "사람이 추가 중", detail: "", amount: 100 }]);

    useQuoteStore.getState().patchFromAgent(structuredRow({
      hospital_name: "다른병원",
      form_state: { ...structuredRow().form_state, customer: { ...baseCustomer, hospitalName: "다른병원" } },
    }));

    expect(useQuoteStore.getState().customItems).toEqual([{ id: "human-edit", name: "사람이 추가 중", detail: "", amount: 100 }]);
    expect(useQuoteStore.getState().customer.hospitalName).toBe("다른병원");
  });

  it("저장 성공(clearDirty) 후에는 다시 patch를 받을 수 있다", () => {
    useQuoteStore.getState().setMemo("사람이 입력 중인 메모");
    useQuoteStore.getState().clearDirty();

    useQuoteStore.getState().patchFromAgent(structuredRow({ form_state: { ...structuredRow().form_state, memo: "Agent가 바꾼 메모" } }));

    expect(useQuoteStore.getState().memo).toBe("Agent가 바꾼 메모");
  });
});
